/**
 * popups-v1.js  -  AppV1 equivalents of the Core ship-combat popup classes.
 *
 * The SF2e / PF2e system renders all actor sheets as AppV1 windows.  AppV2
 * popup windows appear with a transparent background in that context because
 * the system CSS does not supply a background rule for `.application` elements.
 *
 * These classes mirror the behaviour of the corresponding Core AppV2 popups,
 * sharing the same Handlebars templates and socket calls, but extending
 * `foundry.appv1.api.Application` so Foundry's built-in window chrome is used.
 *
 * Registered in the ShipCombat popup override registry during this module's
 * "init" hook (see causodes-shipcombat-sf2e.js).
 */

const {
  CORE_MODULE_ID, MACRO_FIRE_TIERS, buildChargeTiers,
  createActionRequester, ShipCombatState, SystemAdapter, THEME, pixi,
  isOrdnance, classifyZone, getHitQuadrant, testArc,
  _drawArrow, _makeArrowContainer, _destroyContainer, HelmPreview,
  getContactDisplayName, getAttackStanceModifier, isTargetableContactToken,
  calculateRawRamDamage,
} = globalThis.ShipCombat._api;
const MODULE_ID = "causodes-shipcombat-sf2e";
const requestGM = createActionRequester(context =>
  context.craftActor ?? context.shipActor ?? context.ship ?? context.weapon?.parent
);

// ── Shared ──────────────────────────────────────────────────────────────────

// Lock tier colour palette used by BattleClarityPopupV1 (mirrors Core).
const TIER_COLOUR = {
  0: "rgba(85,85,119,0.5)",
  1: "#ff7733",
  2: "#ff4444",
  3: "#dd44ff",
  4: "#44ccff",
};

function _effectiveContactTier(token, state) {
  const own = state.ship?.getActiveTokens?.()?.[0];
  const gs = canvas?.grid?.size;
  if (!own || !gs) return state.getLockTier(token.id);
  const tx = token.x + (token.document.width * gs) / 2;
  const ty = token.y + (token.document.height * gs) / 2;
  const sx = own.x + (own.document.width * gs) / 2;
  const sy = own.y + (own.document.height * gs) / 2;
  return state.getEffectiveLockTier(token.id, Math.hypot(tx - sx, ty - sy) / gs);
}

// ── TargetingPopupV1 ─────────────────────────────────────────────────────────

export class TargetingPopupV1 extends foundry.appv1.api.Application {

  weapon          = null;
  fireMode        = null;
  weaponType      = null;
  targets         = [];
  isOvercharged   = false;
  _shipPos        = null;
  _liveHooks      = null;
  _rerenderFn     = null;
  _arrowContainer = null;

  constructor(options = {}) {
    super(options);
    this.weapon     = options.weapon;
    this.fireMode   = options.fireMode;
    this.weaponType = options.weapon?.system?.resourceType ?? "ammo";
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:        "shipcombat-targeting-popup",
      classes:   ["shipcombat-targeting-popup"],
      template:  `modules/${CORE_MODULE_ID}/templates/apps/targeting-popup.hbs`,
      title:     game.i18n.localize("SHIPCOMBAT.Targeting.Title"),
      width:     420,
      height:    "auto",
      resizable: false,
    });
  }

  async getData(options = {}) {
    const context = await super.getData(options);

    const ship = this.weapon?.parent;
    if (!ship || !this.weapon) return { ...context, targets: [], weapon: null };

    const state     = ShipCombatState.forShip(ship);
    const sys       = ship.system;
    const gunnerRes = sys.resources?.gunner ?? {};
    const tokens    = ship.getActiveTokens?.() ?? [];
    if (!tokens.length) return { ...context, targets: [], weapon: null };

    const token    = tokens[0];
    const gridSize = canvas.grid.size;
    const tokenW   = token.document.width  * gridSize;
    const tokenH   = token.document.height * gridSize;
    const cx       = token.x + tokenW / 2;
    const cy       = token.y + tokenH / 2;
    const heading  = (token.document.rotation + 90) * (Math.PI / 180);

    const sensorComp = ship.items.find(
      i => i.type === `${MODULE_ID}.component` && i.system.slot === "sensor"
    );
    const sensorEffects  = sys.resources?.sensors?.effects ?? [];
    const rangeAmpActive = sensorEffects.some(e => e.actionId === "rangeAmplifier");
    const baseAutoScanRange = (sensorComp?.system?.autoScanRange ?? 0)
      || (sys.autoScanRange ?? 0);
    const bandExpanded = !!(sys.resources?.gunner?.sensorBandExpanded);
    const rawBandSize  = sensorComp?.system?.bandSize ?? sys.sensorBandSize ?? 0;
    const sensor = {
      rating:        sensorComp?.system?.rating ?? sys.sensorRating ?? 0,
      bandSize:      bandExpanded ? rawBandSize * 2 : rawBandSize,
      autoScanRange: rangeAmpActive ? baseAutoScanRange * 2 : baseAutoScanRange,
    };

    // Hostile sensor effects targeting THIS (firing) ship. Utility actions are
    // registered on the player ship's combat state with the affected token's id,
    // so when an NPC ship fires we look ourselves up there. The player ship's
    // own effects only ever target enemy tokens, so this is a no-op for it.
    // Disruption penalises all rolls by the disruptor's sensor hit modifier
    // (min one range band); Overcharge limits weapons to auto-scan range.
    const inboundOvercharged = ShipCombatState.hasSensorEffectOn?.(ship, "sensorOvercharge") ?? false;
    const disruptionPenalty  = ShipCombatState.getDisruptionPenalty?.(ship) ?? 0;

    const weaponRange     = Number(this.weapon.system.range) || 0;
    const fireModeDetails = this._getFireModeDetails(gunnerRes, sys);

    const adapter       = SystemAdapter.current;
    const step          = adapter.getModifierStepSize();
    const accuracyStep  = adapter.getAccuracyAllocationStep();
    const hbs           = adapter.getHitBonusStep();  // fixed hit-bonus step (lock, ranging, BDA, Priority Target, …)
    const candidates = canvas.tokens.placeables.filter(
      token => isTargetableContactToken(token, ship),
    );

    const targets = [];
    const sortedContactIds = candidates.map(target => target.id).filter(Boolean).sort();
    for (const candidate of candidates) {
      const cW = candidate.document.width  * gridSize;
      const cH = candidate.document.height * gridSize;
      const tx = candidate.x + cW / 2;
      const ty = candidate.y + cH / 2;

      const arc = testArc(cx, cy, heading, this.weapon, tx, ty);
      if (!arc.inArc) continue;

      const distSquares = arc.distance / gridSize;
      // SF2e range gate: valid up to weaponRange + 20 × bandSize (hard cap of −20 penalty)
      const sf2eMaxRange = sensor.bandSize > 0 ? weaponRange + 20 * sensor.bandSize : weaponRange;
      if (weaponRange > 0 && distSquares > sf2eMaxRange) continue;
      // Sensor Overcharge: this ship's weapons can only fire within its auto-scan range
      if (inboundOvercharged && distSquares > sensor.autoScanRange) continue;
      const zone = classifyZone(distSquares, weaponRange, sensor) ?? { zone: 3, modifier: 0, label: "SHIPCOMBAT.Targeting.Zone3" };

      const lockTier = ship.type === `${MODULE_ID}.npcShip`
        ? 3
        : state.getEffectiveLockTier(candidate.id, distSquares);
      if (lockTier < 1) continue;

      const attackAngle = Math.atan2(ty - cy, tx - cx);
      const hitQuadrant = getHitQuadrant(candidate.document.rotation ?? 0, attackAngle);

      const lockAccuracyBonus = lockTier >= 4 ? hbs : 0;

      const targetSys       = adapter.getShipData(candidate.document.actor) ?? {};
      const stanceHitMod    = getAttackStanceModifier(sys, targetSys, step);
      const allocAccuracy   = sys.resources?.gunner?.allocAccuracy ?? 0;
      const weaponHitMod    = this.weapon?.system?.traits?.hitRatingModifier ?? 0;

      const fcRaw = sys.resources?.sensors?.fireCorrection ?? null;
      const correctionMatches = fcRaw
        && fcRaw.targetTokenId === candidate.id
        && (fcRaw.type === "rangingFireBonus" || !fcRaw.weaponId || fcRaw.weaponId === this.weapon.id);
      const adjustBearingBonus  = (correctionMatches && fcRaw.type === "adjustBearing")    ? hbs : 0;
      const rangingFireBonus    = (correctionMatches && fcRaw.type === "rangingFireBonus")  ? hbs : 0;
      const activeCorrection    = correctionMatches ? fcRaw : null;

      const priorityTargetId   = sys.resources?.captain?.priorityTargetId ?? null;
      const battleClarityBonus  = (priorityTargetId && priorityTargetId === candidate.id) ? hbs : 0;
      const battleClarityPierce = (priorityTargetId && priorityTargetId === candidate.id) ? 2    : 0;

      const captainHitBonus = sys.resources?.gunner?.captainHitBonus ?? 0;
      const allocEvasion    = targetSys.resources?.pilot?.allocEvasion ?? 0;

      // SF2e distance penalty: -1 per band beyond weapon's effective range, max -20
      const bandsOutside    = sensor.bandSize > 0
        ? Math.ceil(Math.max(0, distSquares - weaponRange) / sensor.bandSize)
        : 0;
      const distancePenalty = -Math.min(20, bandsOutside);

      // SF2e attack formula: Sensor Hit Modifier + Gunner Points + Weapon Hit Modifier - distance
      let totalAccuracy = sensor.rating
      + (allocAccuracy * accuracyStep)
        + weaponHitMod
        + distancePenalty
        + (fireModeDetails.hitMod ?? 0)
        + lockAccuracyBonus
        + adjustBearingBonus
        + rangingFireBonus
        + battleClarityBonus
        + stanceHitMod
        + captainHitBonus;

      // SF2e: within Optimal Range the entire hit modifier is doubled at the end
      const isWithinOptimal    = distSquares <= sensor.autoScanRange;
      const optimalRangeBonus  = isWithinOptimal ? totalAccuracy : 0;
      if (isWithinOptimal) totalAccuracy *= 2;

      // Sensor Disruption: penalty equal to the disruptor's sensor hit modifier
      if (disruptionPenalty) totalAccuracy -= disruptionPenalty;

      // Target AC: base AC + driver evasion allocation (each Driver Point = +1 AC)
      const baseTargetAC      = candidate.document.actor?.system?.armorClass ?? null;
      const effectiveTargetAC = baseTargetAC !== null ? baseTargetAC + allocEvasion : null;

      // Hit chance % at Lock 4 (d20 system: P(d20 + totalAccuracy >= effectiveTargetAC))
      const hitChance = (lockTier >= 4 && effectiveTargetAC !== null)
        ? Math.max(0, Math.min(100, Math.round((21 + totalAccuracy - effectiveTargetAC) / 20 * 100)))
        : null;

      const breakdownParts = [`Base Sensor Hit Mod: ${adapter.formatModifier(sensor.rating)}`];
      if (distancePenalty !== 0)               breakdownParts.push(`Range Penalty (${bandsOutside} band${bandsOutside !== 1 ? "s" : ""}): ${adapter.formatModifier(distancePenalty)}`);
      if ((fireModeDetails.hitMod ?? 0) !== 0) breakdownParts.push(`Fire Mode Hit Mod: ${adapter.formatModifier(fireModeDetails.hitMod ?? 0)}`);
      if (stanceHitMod !== 0)                  breakdownParts.push(`Stance Hit Mod: ${adapter.formatModifier(stanceHitMod)}`);
      if (lockAccuracyBonus !== 0)             breakdownParts.push(`Lock Tier Hit Bonus: ${adapter.formatModifier(lockAccuracyBonus)}`);
    if (allocAccuracy !== 0)                 breakdownParts.push(`Accuracy Hit Mod: ${adapter.formatModifier(allocAccuracy * accuracyStep)}`);
      if (weaponHitMod !== 0)                  breakdownParts.push(`Weapon Hit Mod: ${adapter.formatModifier(weaponHitMod)}`);
      if (adjustBearingBonus !== 0)            breakdownParts.push(`Adj. Bearing Hit Bonus: ${adapter.formatModifier(adjustBearingBonus)}`);
      if (rangingFireBonus !== 0)              breakdownParts.push(`Ranging Fire Hit Bonus: ${adapter.formatModifier(rangingFireBonus)}`);
      if (battleClarityBonus !== 0)            breakdownParts.push(`Priority Target Hit Bonus: ${adapter.formatModifier(battleClarityBonus)}`);
      if (captainHitBonus !== 0)               breakdownParts.push(`Insp. Targeting Hit Bonus: ${adapter.formatModifier(captainHitBonus)}`);
      if (disruptionPenalty)                   breakdownParts.push(`Sensor Disruption: ${adapter.formatModifier(-disruptionPenalty)}`);

      // "Optimal Range ×2" is shown inline in the popup row, not in the tooltip
      const accuracyTooltip = breakdownParts.join("\n");

      const targetArmour = targetSys.armour?.[hitQuadrant] ?? 0;
      const showArmour   = lockTier >= 3 && targetArmour > 0;
      const showDistance = zone.zone === 3;
      const isAutoHit    = false;

      targets.push({
        tokenId: candidate.id,
        name:    getContactDisplayName(sys, candidate.id, {
          currentTier: lockTier,
          realName: candidate.document.name ?? "Unknown",
          fallbackOrdinal: sortedContactIds.indexOf(candidate.id) + 1,
        }),
        img: (() => {
          if (lockTier === 1 && isOrdnance(candidate.document.actor)) {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="7" fill="#ff4444"/></svg>`;
            return `data:image/svg+xml,${encodeURIComponent(svg)}`;
          }
          return candidate.document.texture?.src ?? "icons/svg/mystery-man.svg";
        })(),
        classification: (() => {
          if (lockTier < 1) return null;
          const cls = candidate.document.actor?.system?.classification ?? "";
          if (!cls) return null;
          const CLASSES = [
            { value: "fighter",      label: "Fighter" },
            { value: "picket",       label: "Picket Ship" },
            { value: "cutter",       label: "Cutter" },
            { value: "sloop",        label: "Sloop" },
            { value: "destroyer",    label: "Destroyer" },
            { value: "frigate",      label: "Frigate" },
            { value: "lightCruiser", label: "Light Cruiser" },
            { value: "cruiser",      label: "Cruiser" },
            { value: "battlecruiser",label: "Battlecruiser" },
            { value: "grandCruiser", label: "Grand Cruiser" },
            { value: "battleship",   label: "Battleship" },
            { value: "capitalShip",  label: "Capital Ship" },
            { value: "planetKiller", label: "Planet Killer" },
            { value: "other",        label: "Other" },
          ];
          return CLASSES.find(c => c.value === cls)?.label ?? cls;
        })(),
        bearing: (() => {
          if (lockTier < 1) return null;
          const a = Math.atan2(ty - cy, tx - cx);
          return Math.round((a * 180 / Math.PI + 90 + 360) % 360);
        })(),
        isL1:         lockTier === 1,
        distance:     Math.round(distSquares * 10) / 10,
        showDistance,
        zone:         zone.zone,
        zoneLabel:    game.i18n.localize(zone.label),
        zoneModifier: distancePenalty,
        hitQuadrant,
        hitQuadrantLabel: game.i18n.localize(`SHIPCOMBAT.Sector.${hitQuadrant.charAt(0).toUpperCase() + hitQuadrant.slice(1)}`),
        totalAccuracy,
        accuracyLabel: isAutoHit ? game.i18n.localize("SHIPCOMBAT.Targeting.Auto") : adapter.formatAccuracyDisplay(totalAccuracy, effectiveTargetAC, hitChance),
        isAutoHit,
        isWithinOptimal,
        optimalRangeBonus,
        targetAC:     effectiveTargetAC,
        targetArmour,
        showArmour,
        hitChance,
        lockTier,
        lockAccuracyBonus,
        adjustBearingBonus,
        rangingFireBonus,
        battleClarityBonus,
        battleClarityPierce,
        isRecommended: sys.resources?.sensors?.recommendedTargetId === candidate.id,
        isPriority: priorityTargetId === candidate.id,
        activeCorrection,
        accuracyTooltip,
        targetX: tx,
        targetY: ty,
      });
    }

    targets.sort((a, b) => Number(b.isRecommended) - Number(a.isRecommended)
      || Number(b.isPriority) - Number(a.isPriority)
      || a.distance - b.distance);
    this.targets  = targets;
    this._shipPos = { x: cx, y: cy };

    return {
      ...context,
      weapon:       this.weapon,
      weaponName:   this.weapon.name,
      weaponType:   this.weaponType,
      fireMode:     this.fireMode,
      fireModeLabel: game.i18n.localize(fireModeDetails.label ?? "SHIPCOMBAT.Gunner.Fire"),
      fireModeDetails,
      targets,
      noTargets:    targets.length === 0,
      hasOvercharge: !!(this.weapon?.system?.traits?.overcharge) && this.weaponType === "heat",
      isOvercharged: this.isOvercharged,
      overchargedTraits: this._buildOverchargedTraits(),
      markerPalette: adapter.targetMarkerPalette(),
    };
  }

  activateListeners($html) {
    super.activateListeners($html);
    const html = $html[0];

    // Register live refresh hooks only once (persist across re-renders).
    if (!this._liveHooks) {
      const _rerender = foundry.utils.debounce(() => {
        if (this.rendered) this.render();
      }, 100);
      this._liveHooks = [
        Hooks.on("updateActor",  _rerender),
        Hooks.on("updateToken",  _rerender),
        Hooks.on("refreshToken", _rerender),
      ];
      this._rerenderFn = _rerender;
    }

    html.querySelectorAll("[data-action='confirmFire']").forEach(btn => {
      btn.addEventListener("click", ev => {
        ev.preventDefault();
        this._onConfirmFire(btn.dataset.tokenId);
      });
    });

    const ocToggle = html.querySelector("[data-action='toggleOvercharge']");
    if (ocToggle) {
      ocToggle.addEventListener("click", ev => {
        ev.preventDefault();
        this.isOvercharged = !this.isOvercharged;
        this.render();
      });
    }

    html.querySelectorAll("[data-token-id]").forEach(row => {
      if (row.tagName === "BUTTON") return;
      row.addEventListener("mouseenter", () => {
        const target = this.targets.find(t => t.tokenId === row.dataset.tokenId);
        if (target) this._showArrow(target);
      });
      row.addEventListener("mouseleave", () => this._hideArrow());
    });
  }

  async close(options = {}) {
    this._hideArrow();
    if (this._liveHooks) {
      Hooks.off("updateActor",  this._rerenderFn);
      Hooks.off("updateToken",  this._rerenderFn);
      Hooks.off("refreshToken", this._rerenderFn);
      this._liveHooks  = null;
      this._rerenderFn = null;
    }
    return super.close(options);
  }

  _getFireModeDetails(gunnerRes, sys = null) {
    const fp        = sys?.resources?.gunner?.allocFirepower ?? 0;
    const baseSalvo = Number(this.weapon?.system?.salvoSize) || 1;

    if (this.weaponType === "ammo") {
      const tier = MACRO_FIRE_TIERS.find(t => t.id === this.fireMode);
      if (!tier) return { label: "SHIPCOMBAT.Gunner.Fire", salvoSize: 0, cost: 0, hitMod: 0 };
      const hitMod = SystemAdapter.current.getFireModeHitModifier(tier.hitMod);
      return {
        label:         tier.label,
        salvoSize:     Math.ceil(baseSalvo * tier.salvoMult),
        cost:          tier.ammo,
        hitMod,
        resource:      "ammo",
        resourceLabel: game.i18n.localize("SHIPCOMBAT.Gunner.Ammo"),
      };
    }

    if (this.weaponType === "heat") {
      const traits      = this.weapon?.system?.traits ?? {};
      const heatPerShot = traits.overcharge && this.isOvercharged ? 2 : 1;
      return {
        label:         "SHIPCOMBAT.Gunner.EnergyDischarge",
        salvoSize:     baseSalvo,
        cost:          heatPerShot * baseSalvo,
        hitMod:        0,
        resource:      "heat",
        resourceLabel: game.i18n.localize("SHIPCOMBAT.Gunner.Heat"),
        dmgBonus:      fp,
      };
    }

    if (this.weaponType === "power") {
      const charge          = sys?.resources?.engineer?.auxiliaryPower ?? gunnerRes.power ?? 0;
      const chargeStep      = this.weapon?.system?.chargeStep || 5;
      const tiers           = buildChargeTiers(chargeStep);
      const maxCharge       = chargeStep * 4;
      const effectiveCharge = Math.min(charge, maxCharge);
      const tier            = tiers.find(t => effectiveCharge >= t.min && effectiveCharge <= t.max);
      return {
        label:         tier?.label ?? "SHIPCOMBAT.Gunner.LanceFire",
        salvoSize:     baseSalvo,
        cost:          Math.min(charge, maxCharge),
        hitMod:        0,
        resource:      "power",
        resourceLabel: game.i18n.localize("SHIPCOMBAT.Gunner.Power"),
        multiplier:    tier?.multiplier ?? 0,
        power:         effectiveCharge,
      };
    }

    // pointDefense / unknown
    return { label: "SHIPCOMBAT.Gunner.Fire", salvoSize: baseSalvo, cost: 0, hitMod: 0, resource: "none", resourceLabel: "" };
  }

  _buildOverchargedTraits() {
    const traits  = this.weapon?.system?.traits ?? {};
    const entries = [];
    const MULT    = 3;
    if ((traits.shieldBurn       ?? 0) > 0) entries.push({ label: game.i18n.localize("SHIPCOMBAT.Trait.ShieldBurn"),        base: traits.shieldBurn,        oc: traits.shieldBurn        * MULT });
    if ((traits.rend             ?? 0) > 0) entries.push({ label: game.i18n.localize("SHIPCOMBAT.Trait.Rend"),              base: traits.rend,              oc: traits.rend              * MULT });
    if ((traits.armourPenetration ?? 0) > 0) entries.push({ label: game.i18n.localize("SHIPCOMBAT.Trait.ArmourPenetration"), base: traits.armourPenetration, oc: traits.armourPenetration * MULT });
    if ((traits.devastating      ?? 0) > 0) entries.push({ label: game.i18n.localize("SHIPCOMBAT.Trait.Devastating"),       base: traits.devastating,       oc: traits.devastating       * MULT });
    return entries;
  }

  _showArrow(target) {
    this._hideArrow();
    if (!canvas?.ready || !this._shipPos) return;

    const sx = this._shipPos.x, sy = this._shipPos.y;
    const tx = target.targetX,  ty = target.targetY;

    const container = new PIXI.Container();
    container.name      = "shipcombat-attack-vector";
    container.eventMode = "none";
    canvas.tokens.addChild(container);

    const g  = new PIXI.Graphics();
    container.addChild(g);

    const dx = tx - sx, dy = ty - sy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const nx = dx / len, ny = dy / len;
    const headLen = Math.min(20, len * 0.15);
    const endX = tx - nx * headLen, endY = ty - ny * headLen;

    g.lineStyle(2.5, pixi(THEME.overlay.attackVector), 0.8);
    g.moveTo(sx, sy);
    g.lineTo(endX, endY);

    const perpX = -ny, perpY = nx;
    const hw = headLen * 0.5;
    g.beginFill(pixi(THEME.overlay.attackVector), 0.8);
    g.lineStyle(0);
    g.drawPolygon([tx, ty, endX + perpX * hw, endY + perpY * hw, endX - perpX * hw, endY - perpY * hw]);
    g.endFill();

    this._arrowContainer = container;
  }

  _hideArrow() {
    if (this._arrowContainer && !this._arrowContainer.destroyed) {
      this._arrowContainer.destroy({ children: true });
    }
    this._arrowContainer = null;
  }

  async _onConfirmFire(tokenId) {
    const target = this.targets.find(t => t.tokenId === tokenId);
    if (!target) return;

    const ship        = this.weapon?.parent;
    const gunnerRes   = ship?.system?.resources?.gunner ?? {};
    const fmd         = this._getFireModeDetails(gunnerRes, ship?.system);
    const committed = await requestGM(this, "fireWeapon", {
      weaponId:       this.weapon.id,
      fireMode:       this.fireMode,
      targetToken:    tokenId,
      hitQuadrant:    target.hitQuadrant,
      accuracy:       target.totalAccuracy === "Auto" ? 999 : target.totalAccuracy,
      isAutoHit:      target.isAutoHit,
      zone:           target.zone,
      salvoSize:      fmd.salvoSize ?? 1,
      isOvercharged:  this.isOvercharged,
      fireCorrection: target.activeCorrection ?? null,
    });
    if (committed === false) return;

    this.close();
  }
}

// ── RamTargetPopupV1 ─────────────────────────────────────────────────────────

export class RamTargetPopupV1 extends foundry.appv1.api.Application {

  ship             = null;
  targets          = [];
  _shipPos         = null;
  _targetRing      = null;
  _liveHooks       = null;
  _rerenderFn      = null;
  effSpeed         = 6;
  powerMax         = 100;
  powerRemaining   = 100;
  maxBearingDeg    = 30;
  minMoveGridUnits = 0;
  fuelBurned       = 0;
  shipBasis        = null;
  isRealistic      = false;
  velocityX        = 0;
  velocityY        = 0;
  carryPct         = 0;

  constructor(options = {}) {
    super(options);
    this.ship             = options.ship;
    this.effSpeed         = options.effSpeed         ?? 6;
    this.powerMax         = options.powerMax         ?? 100;
    this.powerRemaining   = options.powerRemaining   ?? 100;
    this.maxBearingDeg    = options.maxBearingDeg    ?? 30;
    this.minMoveGridUnits = options.minMoveGridUnits ?? 0;
    this.fuelBurned       = options.fuelBurned       ?? 0;
    this.shipBasis        = options.shipBasis        ?? null;
    this.isRealistic      = options.isRealistic      ?? false;
    this.velocityX        = options.velocityX        ?? 0;
    this.velocityY        = options.velocityY        ?? 0;
    this.carryPct         = options.carryPct         ?? 0;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:        "shipcombat-ram-target-popup",
      classes:   ["shipcombat-ram-target-popup"],
      template:  `modules/${CORE_MODULE_ID}/templates/apps/ram-target-popup.hbs`,
      title:     game.i18n.localize("SHIPCOMBAT.Dialog.RamTitle"),
      width:     420,
      height:    "auto",
      resizable: false,
    });
  }

  async getData(options = {}) {
    const context = await super.getData(options);

    const ship = this.ship;
    if (!ship) return { ...context, targets: [], noTargets: true };

    const state = ShipCombatState.forShip(ship);
    const tokens = ship.getActiveTokens?.() ?? [];
    if (!tokens.length) return { ...context, targets: [], noTargets: true };

    const token    = tokens[0];
    const gridSize = canvas.grid.size;
    const tokenW   = token.document.width  * gridSize;
    const tokenH   = token.document.height * gridSize;
    const cx       = token.x + tokenW / 2;
    const cy       = token.y + tokenH / 2;

    const shipBasis = this.shipBasis ?? HelmPreview._tokenBasis(token);

    const candidates = canvas.tokens.placeables.filter(target =>
      target !== token && isTargetableContactToken(target, ship),
    );

    const RAM_COEFF        = 2;
    const rammingSys       = this.ship?.system;
    const rammingBowArmour = Math.max(1, rammingSys?.armour?.bow ?? 0);
    const rammingHullMax   = rammingSys?.hull?.max ?? 50;
    const rammingDmgBase   = rammingBowArmour + 0.25 * rammingHullMax;

    const targets = [];
    const sortedContactIds = candidates.map(target => target.id).filter(Boolean).sort();
    for (const candidate of candidates) {
      const cW = candidate.document.width  * gridSize;
      const cH = candidate.document.height * gridSize;
      const tx = candidate.x + cW / 2;
      const ty = candidate.y + cH / 2;

      const reach = this.isRealistic
        ? HelmPreview.canReachRealistic(
            shipBasis, tx, ty,
            this.effSpeed, this.maxBearingDeg,
            this.powerRemaining, this.powerMax,
            this.velocityX, this.velocityY,
            this.carryPct,
          )
        : HelmPreview.canRam(
            shipBasis, tx, ty,
            this.effSpeed, this.maxBearingDeg,
            this.powerRemaining, this.powerMax,
            this.minMoveGridUnits,
          );
      if (!reach) continue;

      const distSquares = Math.sqrt(
        Math.pow((tx - cx) / gridSize, 2) +
        Math.pow((ty - cy) / gridSize, 2),
      );
      const lockTier = ship.type === `${MODULE_ID}.npcShip`
        ? 3
        : state.getEffectiveLockTier(candidate.id, distSquares);
      if (lockTier < 1) continue;

      const attackAngle    = Math.atan2(ty - cy, tx - cx);
      const hitSector      = getHitQuadrant(candidate.document.rotation ?? 0, attackAngle);
      const minThrustPct    = Math.min(this.powerRemaining, Math.ceil(reach.thrustPct * 10) / 10);
      const maxThrustPct    = this.powerRemaining;
      const selectedThrustPct = minThrustPct;
      const totalThrustPct  = this.fuelBurned + selectedThrustPct;

      // Damage preview (mirrors pilotRam formulas exactly)
      const tgtHeadingRad = ((candidate.document.rotation ?? 0) + 90) * (Math.PI / 180);
      let impactAngle = attackAngle - tgtHeadingRad + Math.PI;
      impactAngle = ((impactAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (impactAngle > Math.PI) impactAngle -= 2 * Math.PI;
      const angleModRammed = 0.5 + 0.5 * Math.abs(Math.sin(impactAngle));

      const targetSys            = candidate.document.actor?.system;
      const targetArmourInSector = Math.max(1, targetSys?.armour?.[hitSector] ?? 0);
      const targetHullMax        = targetSys?.hull?.max ?? 50;
      const targetDmgBase        = targetArmourInSector + 0.25 * targetHullMax;
      const rawDamage = calculateRawRamDamage({
        rammingBase: rammingDmgBase,
        targetBase: targetDmgBase,
        rammingBowArmour,
        angleModifier: angleModRammed,
        thrustPct: totalThrustPct,
        coefficient: RAM_COEFF,
      });

      targets.push({
        tokenId:          candidate.id,
        name:             getContactDisplayName(rammingSys, candidate.id, {
          currentTier: lockTier,
          realName: candidate.document.name ?? "Unknown",
          fallbackOrdinal: sortedContactIds.indexOf(candidate.id) + 1,
        }),
        img:              candidate.document.texture?.src ?? "icons/svg/mystery-man.svg",
        distance:         Math.round(distSquares * 10) / 10,
        bearingDeg:       reach.bearingDeg,
        thrustPct:        reach.thrustPct,
        minThrustPct,
        maxThrustPct,
        selectedThrustPct,
        hitSector,
        hitSectorLabel:   game.i18n.localize(`SHIPCOMBAT.Sector.${hitSector.charAt(0).toUpperCase() + hitSector.slice(1)}`),
        lockTier,
        targetX:     tx,
        targetY:     ty,
        attackAngle,
        damageOut: rawDamage.damageToRammed,
        damageIn: rawDamage.damageToRamming,
        rammingDmgBase,
        targetDmgBase,
        rammingBowArmour,
        angleModRammed,
      });
    }

    targets.sort((a, b) => a.distance - b.distance);
    this.targets  = targets;
    this._shipPos = { x: cx, y: cy };

    return {
      ...context,
      targets,
      noTargets:      targets.length === 0,
      powerRemaining: this.powerRemaining,
      powerMax:       this.powerMax,
      shipImg:        this.ship?.img ?? "icons/svg/mystery-man.svg",
    };
  }

  activateListeners($html) {
    super.activateListeners($html);
    const html = $html[0];

    if (!this._liveHooks) {
      const _rerender = foundry.utils.debounce(() => {
        if (this.rendered) this.render();
      }, 100);
      this._liveHooks = [
        Hooks.on("updateActor",  _rerender),
        Hooks.on("updateToken",  _rerender),
        Hooks.on("refreshToken", _rerender),
      ];
      this._rerenderFn = _rerender;
    }

    html.querySelectorAll("[data-action='confirmRam']").forEach(btn => {
      btn.addEventListener("click", ev => {
        ev.preventDefault();
        this._onConfirmRam(btn.dataset.tokenId);
      });
    });

    html.querySelectorAll("[data-ram-thrust]").forEach(input => {
      input.addEventListener("input", event => {
        const row = input.closest(".shipcombat-ram-target-row");
        const target = this.targets.find(entry => entry.tokenId === row?.dataset.tokenId);
        if (!target) return;
        target.selectedThrustPct = Math.max(target.minThrustPct, Math.min(target.maxThrustPct, Number(event.target.value)));
        const damage = calculateRawRamDamage({
          rammingBase: target.rammingDmgBase,
          targetBase: target.targetDmgBase,
          rammingBowArmour: target.rammingBowArmour,
          angleModifier: target.angleModRammed,
          thrustPct: this.fuelBurned + target.selectedThrustPct,
        });
        row.querySelector("[data-ram-thrust-value]").textContent = `${Math.round(target.selectedThrustPct * 10) / 10}%`;
        row.querySelector("[data-ram-damage-out]").textContent = `~${damage.damageToRammed}`;
        row.querySelector("[data-ram-damage-in]").textContent = `~${damage.damageToRamming}`;
      });
    });

    html.querySelectorAll(".shipcombat-ram-target-row[data-token-id]").forEach(row => {
      row.addEventListener("mouseenter", () => {
        const target = this.targets.find(t => t.tokenId === row.dataset.tokenId);
        if (!target) return;
        const token = this.ship?.getActiveTokens?.()?.[0];
        if (token) {
          if (this.isRealistic) {
            HelmPreview.showRamRealistic(token, target.bearingDeg, target.thrustPct, this.effSpeed, this.velocityX, this.velocityY, this.carryPct);
          } else {
            HelmPreview.showRam(token, target.bearingDeg, target.thrustPct, this.effSpeed, this.minMoveGridUnits);
          }
        }
        this._showTargetRing(target);
      });
      row.addEventListener("mouseleave", () => {
        HelmPreview.hide();
        this._hideTargetRing();
      });
    });
  }

  async close(options = {}) {
    HelmPreview.hide();
    this._hideTargetRing();
    if (this._liveHooks) {
      Hooks.off("updateActor",  this._rerenderFn);
      Hooks.off("updateToken",  this._rerenderFn);
      Hooks.off("refreshToken", this._rerenderFn);
      this._liveHooks  = null;
      this._rerenderFn = null;
    }
    return super.close(options);
  }

  _showTargetRing(target) {
    this._hideTargetRing();
    if (!canvas?.ready) return;

    const candidate = canvas.tokens.placeables.find(t => t.id === target.tokenId);
    if (!candidate) return;

    const gridSize = canvas.grid.size;
    const w  = candidate.document.width  * gridSize;
    const h  = candidate.document.height * gridSize;
    const tx = candidate.x + w / 2;
    const ty = candidate.y + h / 2;
    const r  = Math.max(w, h) / 2 + 6;

    const container = new PIXI.Container();
    container.name      = "shipcombat-ram-target-ring";
    container.eventMode = "none";
    canvas.tokens.addChild(container);

    const g = new PIXI.Graphics();
    g.lineStyle(3, pixi(THEME.overlay.helmRam), 0.9);
    g.drawCircle(tx, ty, r);
    container.addChild(g);

    this._targetRing = container;
  }

  _hideTargetRing() {
    if (this._targetRing && !this._targetRing.destroyed) {
      this._targetRing.destroy({ children: true });
    }
    this._targetRing = null;
  }

  async _onConfirmRam(tokenId) {
    const target = this.targets.find(t => t.tokenId === tokenId);
    if (!target) return;

    const token = this.ship?.getActiveTokens?.()?.[0];
    if (!token) return;

    const confirmed = await Dialog.confirm({
      title:   game.i18n.localize("SHIPCOMBAT.Dialog.RamTitle"),
      content: `<p>${game.i18n.format("SHIPCOMBAT.Dialog.RamConfirmBody", {
        name:   target.name,
        pct:    Math.round(target.selectedThrustPct),
        sector: target.hitSectorLabel,
      })}</p>`,
    });
    if (!confirmed) return;

    if (this.isRealistic) {
      HelmPreview.showRamRealistic(token, target.bearingDeg, target.thrustPct, this.effSpeed, this.velocityX, this.velocityY, this.carryPct);
    } else {
      HelmPreview.showRam(token, target.bearingDeg, target.thrustPct, this.effSpeed, this.minMoveGridUnits);
    }

    let projected, waypoints;
    if (this.isRealistic) {
      projected = HelmPreview.projectPositionRealistic(token, target.bearingDeg, target.thrustPct, this.effSpeed, this.velocityX, this.velocityY, this.carryPct);
      waypoints = HelmPreview.projectWaypointsRealistic(token, target.bearingDeg, target.thrustPct, this.effSpeed, this.velocityX, this.velocityY, this.carryPct);
    } else {
      projected = HelmPreview.projectPosition(token, target.bearingDeg, target.thrustPct, this.effSpeed, this.minMoveGridUnits);
      waypoints = HelmPreview.projectWaypoints(token, target.bearingDeg, target.thrustPct, this.effSpeed, this.minMoveGridUnits);
    }
    HelmPreview.hide();

    if (!projected) {
      ui.notifications.warn(game.i18n.localize("SHIPCOMBAT.Warning.RamProjectionFailed"));
      return;
    }

    if (this.isRealistic) {
      const sheet = this.ship?.sheet;
      if (sheet?._helmState) sheet._helmState.carryPct = 100;
    }

    const committed = await requestGM(this, "pilotRam", {
      userId:         game.user.id,
      targetTokenId:  tokenId,
      fuelUsed:       this.fuelBurned + target.selectedThrustPct,
      driftUsed:      this.isRealistic ? 0 : this.minMoveGridUnits,
      speed:          this.effSpeed,
      newX:           projected.x,
      newY:           projected.y,
      newRotation:    projected.rotation,
      waypoints,
      attackAngle:    target.attackAngle,
      powerMax:       this.powerMax,
      maxBearingDeg:  this.maxBearingDeg,
    });
    if (committed === false) return;

    this.close();
  }
}

// ── BattleClarityPopupV1 ─────────────────────────────────────────────────────

export class BattleClarityPopupV1 extends foundry.appv1.api.Application {

  _liveHooks  = null;
  _rerenderFn = null;

  constructor(options = {}) {
    super(options);
    this.shipActor = options.shipActor ?? null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:        "shipcombat-battle-clarity-popup",
      classes:   ["shipcombat-targeting-popup"],
      template:  `modules/${CORE_MODULE_ID}/templates/apps/battle-clarity-popup.hbs`,
      title:     game.i18n.localize("SHIPCOMBAT.Captain.Core.BCTitle"),
      width:     360,
      height:    "auto",
      resizable: false,
    });
  }

  async getData(options = {}) {
    const context = await super.getData(options);

    const state = ShipCombatState.forShip(this.shipActor);
    const data  = state.getData();

    const candidates = canvas.tokens?.placeables?.filter(
      token => isTargetableContactToken(token, this.shipActor),
    ) ?? [];

    const sortedContactIds = candidates.map(target => target.id).filter(Boolean).sort();
    const recommendedTargetId = data.resources?.sensors?.recommendedTargetId ?? null;
    const priorityTargetId = data.resources?.captain?.priorityTargetId ?? null;
    const targets = candidates.map(t => {
      const lockTier = _effectiveContactTier(t, state);
      if (lockTier < 1) return null;
      return {
        tokenId:    t.id,
        name:       getContactDisplayName(data, t.id, {
          currentTier: lockTier,
          realName: t.document.name ?? "Unknown",
          fallbackOrdinal: sortedContactIds.indexOf(t.id) + 1,
        }),
        img:        t.document.texture?.src ?? "icons/svg/mystery-man.svg",
        lockTier,
        bearing:    Math.round(t.document.rotation),
        lockLabel:  `L${lockTier}`,
        lockColour: TIER_COLOUR[lockTier] ?? TIER_COLOUR[0],
        isRecommended: recommendedTargetId === t.id,
        isPriority: priorityTargetId === t.id,
      };
    }).filter(Boolean).sort((a, b) => Number(b.isRecommended) - Number(a.isRecommended) || b.lockTier - a.lockTier);

    return {
      ...context,
      targets,
      noTargets: targets.length === 0,
      markerPalette: SystemAdapter.current.targetMarkerPalette(),
    };
  }

  activateListeners($html) {
    super.activateListeners($html);
    const html = $html[0];

    if (!this._liveHooks) {
      const _rerender = foundry.utils.debounce(() => {
        if (this.rendered) this.render();
      }, 100);
      this._liveHooks = [
        Hooks.on("updateActor", _rerender),
        Hooks.on("updateToken", _rerender),
      ];
      this._rerenderFn = _rerender;
    }

    html.querySelectorAll("[data-action='confirmDesignate']").forEach(btn => {
      btn.addEventListener("click", async ev => {
        ev.preventDefault();
        const tokenId = btn.dataset.tokenId;
        if (!tokenId) return;
        const committed = await requestGM(this, "captainCoreAction", {
          actionId: "battleClarity",
          tokenId,
        });
        if (committed === false) return;
        this.close();
      });
    });
  }

  async close(options = {}) {
    if (this._liveHooks) {
      Hooks.off("updateActor", this._rerenderFn);
      Hooks.off("updateToken", this._rerenderFn);
      this._liveHooks  = null;
      this._rerenderFn = null;
    }
    return super.close(options);
  }
}

// ── StrikeCraftAttackPopupV1 ─────────────────────────────────────────────────

export class StrikeCraftAttackPopupV1 extends foundry.appv1.api.Application {

  craftActor      = null;
  targets         = [];
  _shipPos        = null;
  _arrowContainer = null;
  _liveHooks      = null;
  _rerenderFn     = null;

  constructor(options = {}) {
    super(options);
    this.craftActor = options.craftActor;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:        "shipcombat-sc-attack-popup",
      classes:   ["shipcombat-sc-attack-popup", "shipcombat-targeting-popup"],
      template:  `modules/${CORE_MODULE_ID}/templates/apps/strike-craft-attack-popup.hbs`,
      title:     game.i18n.localize("SHIPCOMBAT.StrikeCraft.AttackTitle"),
      width:     380,
      height:    "auto",
      resizable: false,
    });
  }

  async getData(options = {}) {
    const context = await super.getData(options);

    const actor = this.craftActor;
    if (!actor) return { ...context, targets: [], noTargets: true };

    const sys   = actor.system;
    const token = actor.getActiveTokens()?.[0];
    if (!token || !canvas?.ready) return { ...context, targets: [], noTargets: true };

    const gs  = canvas.grid.size;
    const cx  = token.x + (token.document.width  * gs) / 2;
    const cy  = token.y + (token.document.height * gs) / 2;

    const heading = ((token.document.rotation ?? 0) + 90) * (Math.PI / 180);
    const halfArc = ((sys.payloadAngle ?? 120) / 2) * (Math.PI / 180);

    const sensor = {
      rating:        sys.sensorRating   ?? 0,
      bandSize:      sys.sensorBandSize ?? 0,
      autoScanRange: sys.autoScanRange  ?? 0,
    };
    const weaponRange = sys.autoScanRange ?? 0;

    const attackedThisTurn  = actor.getFlag(MODULE_ID, "attackedThisTurn") ?? [];
    const isFighter         = sys.craftType === "fighter";
    const shipTypes         = [`${MODULE_ID}.ship`, `${MODULE_ID}.npcShip`];
    if (isFighter) {
      shipTypes.push(`${MODULE_ID}.torpedo`);
      shipTypes.push(`${MODULE_ID}.strikeCraft`);
    }

    const parentShipTokenId = sys.parentShipTokenId ?? null;
    const parentShipData = SystemAdapter.current.getShipData(
      canvas.tokens.get(parentShipTokenId)?.document?.actor,
    ) ?? {};
    const parentShipActor = canvas.tokens.get(parentShipTokenId)?.document?.actor ?? null;
    const parentState = parentShipActor
      ? ShipCombatState.forShip(parentShipActor)
      : ShipCombatState;

    const candidates = canvas.tokens.placeables.filter(t => {
      if (!shipTypes.includes(t.document.actor?.type) && !(isFighter && isOrdnance(t.document.actor))) return false;
      if (t.id === token.id) return false;
      if (parentShipTokenId && t.id === parentShipTokenId) return false;
      const tParent = t.document.actor?.system?.parentShipTokenId;
      if (tParent && tParent === parentShipTokenId) return false;
      return isTargetableContactToken(t, parentShipActor);
    });

    const targets = [];
    const contactData = parentState.getData();
    const sortedContactIds = candidates.map(target => target.id).filter(Boolean).sort();
    for (const candidate of candidates) {
      const cW = candidate.document.width  * gs;
      const cH = candidate.document.height * gs;
      const tx = candidate.x + cW / 2;
      const ty = candidate.y + cH / 2;

      // Closest-edge distance from craft to candidate
      const clx  = Math.max(candidate.x, Math.min(cx, candidate.x + cW));
      const cly  = Math.max(candidate.y, Math.min(cy, candidate.y + cH));
      const dist = Math.sqrt((cx - clx) ** 2 + (cy - cly) ** 2);

      // Forward-arc check
      const angle = Math.atan2(ty - cy, tx - cx);
      let rel = angle - heading;
      rel = ((rel % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (rel > Math.PI) rel -= 2 * Math.PI;
      if (Math.abs(rel) > halfArc) continue;

      const distSquares = dist / gs;
      const zone = classifyZone(distSquares, weaponRange, sensor);
      if (!zone) continue;

      const lockTier = parentState.getEffectiveLockTier(candidate.id, distSquares);
      if (lockTier < 1) continue;

      const adapter      = SystemAdapter.current;
      const lockBonus    = lockTier >= 4 ? adapter.getHitBonusStep() : 0;
      const finalZoneMod = (zone.zone === 3 && lockTier >= 4) ? 0 : zone.modifier;
      const targetData   = adapter.getShipData(candidate.document.actor) ?? {};
      const stanceHitMod = getAttackStanceModifier(parentShipData, targetData, adapter.getModifierStepSize());
      let totalAccuracy  = sensor.rating + finalZoneMod + lockBonus + stanceHitMod;

      let zone1Bonus = 0;
      if (zone.zone === 1) {
        zone1Bonus     = adapter.computeZone1Bonus(totalAccuracy);
        totalAccuracy += zone1Bonus;
      }

      const attackAngle      = Math.atan2(ty - cy, tx - cx);
      const hitQuadrant      = getHitQuadrant(candidate.document.rotation ?? 0, attackAngle);
      const hitQuadrantLabel = game.i18n.localize(
        `SHIPCOMBAT.Sector.${hitQuadrant.charAt(0).toUpperCase() + hitQuadrant.slice(1)}`
      );

      const breakdown = [`Base: ${adapter.formatTargetNumber(sensor.rating)}`];
      if (finalZoneMod !== 0) breakdown.push(`Distance: ${adapter.formatModifier(finalZoneMod)}`);
      if (lockBonus    !== 0) breakdown.push(`Lock Tier: ${adapter.formatModifier(lockBonus)}`);
      if (stanceHitMod !== 0) breakdown.push(`Stance: ${adapter.formatModifier(stanceHitMod)}`);
      if (zone1Bonus   !== 0) breakdown.push(`Close Scan: ${adapter.formatModifier(zone1Bonus)}`);
      const accuracyTooltip = breakdown.join("\n");
      const targetAC = adapter.getTargetAC(candidate.document.actor);

      targets.push({
        tokenId:         candidate.id,
        name:            getContactDisplayName(contactData, candidate.id, {
          currentTier: lockTier,
          realName: candidate.document.name ?? "Unknown",
          fallbackOrdinal: sortedContactIds.indexOf(candidate.id) + 1,
        }),
        img:             candidate.document.texture?.src ?? "icons/svg/mystery-man.svg",
        distance:        Math.round(distSquares * 10) / 10,
        zone:            zone.zone,
        zoneLabel:       game.i18n.localize(zone.label),
        zoneModifier:    finalZoneMod,
        hitQuadrant,
        hitQuadrantLabel,
        totalAccuracy,
        accuracyLabel:    adapter.formatAccuracyDisplay(totalAccuracy, targetAC),
        lockTier,
        alreadyAttacked: attackedThisTurn.includes(candidate.id),
        accuracyTooltip,
        targetX: tx,
        targetY: ty,
      });
    }

    targets.sort((a, b) => a.distance - b.distance);
    this.targets  = targets;
    this._shipPos = { x: cx, y: cy };

    return {
      ...context,
      targets,
      noTargets:      targets.length === 0,
      craftName:      actor.name,
      craftImg:       actor.img ?? "icons/svg/mystery-man.svg",
      craftTypeLabel: sys.craftType === "bomber"
        ? game.i18n.localize("SHIPCOMBAT.CraftType.Bomber")
        : game.i18n.localize("SHIPCOMBAT.CraftType.Fighter"),
      ammo: sys.ammo?.value ?? 0,
    };
  }

  activateListeners($html) {
    super.activateListeners($html);
    const html = $html[0];

    if (!this._liveHooks) {
      const _rerender = foundry.utils.debounce(() => {
        if (this.rendered) this.render();
      }, 100);
      this._liveHooks = [
        Hooks.on("updateActor",  _rerender),
        Hooks.on("updateToken",  _rerender),
        Hooks.on("refreshToken", _rerender),
      ];
      this._rerenderFn = _rerender;
    }

    html.querySelectorAll("[data-action='confirmAttack']").forEach(btn => {
      btn.addEventListener("click", ev => {
        ev.preventDefault();
        this._onConfirmAttack(btn.dataset.tokenId);
      });
    });

    html.querySelectorAll(".shipcombat-tp-target[data-token-id]").forEach(row => {
      row.addEventListener("mouseenter", () => {
        const t = this.targets.find(x => x.tokenId === row.dataset.tokenId);
        if (t) this._showArrow(t);
      });
      row.addEventListener("mouseleave", () => this._hideArrow());
    });
  }

  async close(options = {}) {
    this._hideArrow();
    if (this._liveHooks) {
      Hooks.off("updateActor",  this._rerenderFn);
      Hooks.off("updateToken",  this._rerenderFn);
      Hooks.off("refreshToken", this._rerenderFn);
      this._liveHooks  = null;
      this._rerenderFn = null;
    }
    return super.close(options);
  }

  _showArrow(target) {
    this._hideArrow();
    if (!canvas?.ready || !this._shipPos) return;
    const container = _makeArrowContainer("shipcombat-sc-attack-vector");
    _drawArrow(
      container,
      this._shipPos.x, this._shipPos.y,
      target.targetX,  target.targetY,
      pixi(THEME.overlay.attackVector),
    );
    this._arrowContainer = container;
  }

  _hideArrow() {
    _destroyContainer(this._arrowContainer);
    this._arrowContainer = null;
  }

  async _onConfirmAttack(tokenId) {
    const target = this.targets.find(t => t.tokenId === tokenId);
    if (!target || target.alreadyAttacked) return;

    const sys        = SystemAdapter.current.getShipData(this.craftActor);
    // SF2e stores ordnance hull as HP remaining: intact airframes = hull.value
    // (Core's damage-taken formula would invert the flight size here).
    const flightSize = Math.max(0, sys.hull?.value ?? 0);
    const damage     = sys.payloadDamage ?? 0;
    const salvoSize  = (sys.payloadCount ?? 1) * flightSize;
    const resolved = await requestGM(this, "strikeCraftAttack", {
      craftName:     this.craftActor.name,
      craftImg:      this.craftActor.img,
      targetTokenId: tokenId,
      hitQuadrant:   target.hitQuadrant,
      accuracy:      target.totalAccuracy,
      damage,
      payloadDiceCount: sys.payloadDiceCount ?? null,
      payloadDiceSize:  sys.payloadDiceSize  ?? null,
      payloadDamageType: sys.payloadDamageType ?? null,
      traits:        sys.traits,
      salvoSize,
    });
    if (!resolved?.ok) return;

    this.close();
  }
}

// ── RecoverCraftPopupV1 ──────────────────────────────────────────────────────

export class RecoverCraftPopupV1 extends foundry.appv1.api.Application {

  _nearbyCraft    = [];
  _shipPos        = null;
  _arrowContainer = null;
  _resolvePromise = null;

  constructor(options = {}) {
    super(options);
    this._nearbyCraft = options.nearbyCraft ?? [];
    this._shipPos     = options.shipPos     ?? null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:        "shipcombat-recover-craft-popup",
      classes:   ["shipcombat-recover-craft-popup", "shipcombat-targeting-popup"],
      template:  `modules/${CORE_MODULE_ID}/templates/apps/recover-craft-popup.hbs`,
      title:     game.i18n.localize("SHIPCOMBAT.Ordnance.SelectCraftTitle"),
      width:     320,
      height:    "auto",
      resizable: false,
    });
  }

  /**
   * Render the popup and return a Promise that resolves with the selected
   * tokenId (string) or null if the popup is dismissed without selection.
   */
  show() {
    return new Promise(resolve => {
      this._resolvePromise = resolve;
      this.render(true);
    });
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    return {
      ...context,
      craft:     this._nearbyCraft,
      noTargets: this._nearbyCraft.length === 0,
    };
  }

  activateListeners($html) {
    super.activateListeners($html);
    const html = $html[0];

    html.querySelectorAll("[data-action='confirmRecall']").forEach(btn => {
      btn.addEventListener("click", ev => {
        ev.preventDefault();
        const tokenId = btn.dataset.tokenId;
        this._resolvePromise?.(tokenId);
        this._resolvePromise = null;
        this.close();
      });
    });

    html.querySelectorAll(".shipcombat-tp-target[data-token-id]").forEach(row => {
      row.addEventListener("mouseenter", () => {
        const c = this._nearbyCraft.find(x => x.tokenId === row.dataset.tokenId);
        if (c) this._showArrow(c);
      });
      row.addEventListener("mouseleave", () => this._hideArrow());
    });
  }

  async close(options = {}) {
    this._hideArrow();
    this._resolvePromise?.(null);
    this._resolvePromise = null;
    return super.close(options);
  }

  _showArrow(craft) {
    this._hideArrow();
    if (!canvas?.ready || !this._shipPos) return;
    const container = _makeArrowContainer("shipcombat-recover-vector");
    _drawArrow(
      container,
      this._shipPos.x, this._shipPos.y,
      craft.targetX,   craft.targetY,
      pixi(THEME.roles.ordnance),
    );
    this._arrowContainer = container;
  }

  _hideArrow() {
    _destroyContainer(this._arrowContainer);
    this._arrowContainer = null;
  }
}
