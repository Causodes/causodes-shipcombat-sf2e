const { NpcShipSheetV1Mixin, buildHelmContext } = globalThis.ShipCombat._api;
import { ShipIWREditor } from "../ship/ShipSheet.js";

// Tagify lives in the active system's vendor bundle and is exported as `b`
// (tagify_min) on BOTH sf2e and pf2e. Load it lazily from the active system so
// the sheet works on sf2e and on pf2e + sf2e-anachronism.
let _TagifyCtor = null;
async function loadTagify() {
  if (_TagifyCtor) return _TagifyCtor;
  const mod = await import(`/systems/${game.system.id}/vendor.mjs`);
  const factory = mod.b;                       // tagify_min memoised factory
  _TagifyCtor = typeof factory === "function" ? factory() : factory;
  return _TagifyCtor;
}

export class NpcShipSheet extends NpcShipSheetV1Mixin(foundry.appv1.sheets.ActorSheet) {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      // The core mixin explicitly resets classes to [] (wiping DocumentSheet's "sheet" class).
      // We must re-add "sheet" here so that the native SF2e NPC CSS selector
      //   .actor.npc.sheet form { --font-primary: ...; display: flex; ... }
      // actually matches our window element and all base NPC styling applies automatically.
      classes: ["sheet", "actor", "npc", "crb-style", "vehicle", "shipcombat-ship", "shipcombat-npc-ship"],
      template: "modules/causodes-shipcombat-sf2e/templates/actor/npc-ship-sheet-sf2e.hbs",
      // contentSelector points at .sheet-content; the self-wrapping partials
      // are direct children (section.tab[data-tab="main"] etc.) so the Tabs
      // class can find and toggle them correctly.
      tabs: [{ navSelector: ".npc-sheet-tabs", contentSelector: ".sheet-content", initial: "main" }],
      scrollY: [".sheet-content .tab.active"],
    });
  }

  /**
   * AppV1 Application._render does mergeObject(this.options, options, {insertKeys:false}).
   * If this.options.token is already a live TokenDocument and options.token is also
   * a TokenDocument, the recursive merge fails because Document._id is read-only.
   * Clearing to null here (before every _render) lets the merge do a simple assignment
   * instead of a recursive object merge, which is safe.
   * The ActorSheet.token getter uses this.object.token || this.options.token, so
   * the token is always restored correctly by the merge that follows.
   */
  async _render(force, options) {
    this.options.token = null;
    return super._render(force, options);
  }

  async getData(options) {
    const ctx = await super.getData(options);
    // Provide tab context objects so {{tab.id}} in the Core partials renders
    // the correct data-tab value instead of empty string.
    ctx.tabsById = {
      main:     { id: "main",     cssClass: "" },
      movement: { id: "movement", cssClass: "" },
      gunner:   { id: "gunner",   cssClass: "" },
      ordnance: { id: "ordnance", cssClass: "" },
    };

    // IWR — localized display lists for the sidebar.
    // NpcShipModel stores IWR at system.traits.di/dv/dr (same schema as ShipModel),
    // so ShipIWREditor writes to the correct paths without any path mapping needed.
    const damageTypes    = CONFIG.PF2E?.damageTypes    ?? {};
    const conditionTypes = CONFIG.PF2E?.conditionTypes ?? {};
    const immunityTypes  = CONFIG.PF2E?.immunityTypes  ?? {};
    const allImmunityTypes = { ...damageTypes, ...conditionTypes, ...immunityTypes };

    const localizeType = (types, slug) => {
      const key = types[slug];
      if (!key) return slug.charAt(0).toUpperCase() + slug.slice(1);
      return typeof key === "string" && key.includes(".") ? game.i18n.localize(key) : key;
    };

    ctx.immunities = (ctx.sys?.traits?.di ?? []).map(slug => ({
      slug, label: localizeType(allImmunityTypes, slug),
    }));
    ctx.weaknesses = (ctx.sys?.traits?.dv ?? []).map(w => ({
      type: w.type, value: w.value, label: localizeType(damageTypes, w.type),
    }));
    ctx.resistances = (ctx.sys?.traits?.dr ?? []).map(r => ({
      type: r.type, value: r.value, label: localizeType(damageTypes, r.type),
    }));

    // Classification dropdown options (mirrors ShipSheet.getData).
    ctx.shipClassifications = [
      { value: "fighter",       label: "Fighter" },
      { value: "shuttle",       label: "Shuttle" },
      { value: "scout",         label: "Scout" },
      { value: "transport",     label: "Transport" },
      { value: "gunship",       label: "Gunship" },
      { value: "freighter",     label: "Freighter" },
      { value: "corvette",      label: "Corvette" },
      { value: "destroyer",     label: "Destroyer" },
      { value: "cruiser",       label: "Cruiser" },
      { value: "battlecruiser", label: "Battlecruiser" },
      { value: "dreadnought",   label: "Dreadnought" },
      { value: "flagship",      label: "Flagship" },
    ];

    // Rarity, size, and elite/weak adjustment for the header.
    ctx.actorRarities = CONFIG.PF2E?.rarityTraits ?? {};
    ctx.actorSizes    = CONFIG.PF2E?.actorSizes   ?? {};
    ctx.isElite       = (ctx.sys?.details?.adjustment ?? "") === "elite";
    ctx.isWeak        = (ctx.sys?.details?.adjustment ?? "") === "weak";

    // Adjusted level displayed in the header badge (base ± 1 for elite/weak).
    const baseLevel    = ctx.sys?.details?.level?.value ?? 1;
    ctx.displayLevel   = baseLevel + (ctx.isElite ? 1 : ctx.isWeak ? -1 : 0);

    // Formatted initiative modifier — PIL is used as the flat initiative value.
    const piloting      = ctx.sys?.attributes?.piloting ?? 0;
    ctx.initiativeMod   = `${piloting >= 0 ? "+" : ""}${piloting}`;

    // Form-level class used by CSS to color stat values when adjusted.
    ctx.adjustmentClass = ctx.isElite ? "adjustment-elite" : ctx.isWeak ? "adjustment-weak" : "";

    // Trait tagify data for the header traits row (mirrors native NPC traitTagifyData).
    // CONFIG.PF2E.creatureTraits maps slug → i18n key.
    const creatureTraits = CONFIG.PF2E?.creatureTraits ?? {};
    const traitSlugs     = ctx.sys?.traits?.value ?? [];
    ctx.traitTagifyData  = traitSlugs.map(slug => {
      const key   = creatureTraits[slug];
      const value = key ? game.i18n.localize(key)
                        : slug.charAt(0).toUpperCase() + slug.slice(1);
      return { id: slug, value };
    });

    // Re-build helm context so movement stats are correct for SF2e NPC ships.
    try {
      const mv = ctx.sys?.movement ?? {};
      const components = this.actor.items.filter(i => i.type?.endsWith(".component"));
      const engine = components.find(c => c.system?.slot === "engine");
      const npcShipToken = this.actor.getActiveTokens()?.[0];

      // Engine component overrides base stats when installed (mirrors computeDerived).
      const rawSpeed = engine?.system?.speed          ?? mv.baseSpeed          ?? mv.speed          ?? 0;
      const rawMano  = engine?.system?.maneuverability ?? mv.baseManeuverability ?? mv.maneuverability ?? 0;

      const patchedSys = {
        ...ctx.sys,
        movement: { ...mv, speed: rawSpeed, maneuverability: rawMano },
      };
      ctx.helm = buildHelmContext(patchedSys, {
        engineComponent: engine,
        velocityBearingMode: this._velocityBearingMode ?? "relative",
        shipRotation: npcShipToken?.document?.rotation ?? 0,
      });
    } catch (err) {
      // fail silently; keep existing helm context from super
    }

    return ctx;
  }

  activateListeners($html) {
    super.activateListeners($html);
    const root = $html[0];

    // SF2e/PF2e: NPC ship initiative = d20 + PIL modifier.
    // Intercept the core mixin's npcRollInitiative action in the capture phase
    // so stopImmediatePropagation() prevents the jQuery delegation (bubble phase)
    // on $html from also firing.
    const rollInitBtn = root.querySelector("[data-action='npcRollInitiative']");
    if (rollInitBtn) {
      rollInitBtn.addEventListener("click", async (event) => {
        event.stopImmediatePropagation();
        if (!game.combat) return;
        const token    = this.actor.getActiveTokens()?.[0];
        const combatant = token
          ? game.combat.combatants.find(c => c.tokenId === token.id)
          : game.combat.combatants.find(c => c.actor?.id === this.actor.id);
        if (!combatant) return;
        const { SystemAdapter } = globalThis.ShipCombat._api;
        const sys      = SystemAdapter.current.getShipData(this.actor);
        const piloting = sys.attributes?.piloting ?? 0;
        const { total } = await SystemAdapter.current.rollShipInitiativeFromAttribute(
          piloting,
          game.i18n.localize("SHIPCOMBAT.NpcShip.RollInitiative"),
          { speaker: ChatMessage.getSpeaker({ actor: this.actor }) },
        );
        await combatant.update({ initiative: SystemAdapter.current.toCombatantInitiative(total, this.actor) });
      }, true /* capture */);
    }

    // SF2e NPC combat rolls — include the attribute modifier in the d20 roll.
    // For SF2e NPCs, system.attributes.piloting / tech / gunnery are signed d20
    // modifiers (e.g. +8), not WH40K-style target-number characteristics.
    // We intercept each action in the capture phase (stopImmediatePropagation)
    // so the jQuery-delegated core handler never fires.

    // ── Piloting / Movement (PIL) ──────────────────────────────────────────
    for (const btn of root.querySelectorAll("[data-action='npcRollPiloting']")) {
      btn.addEventListener("click", async (event) => {
        event.stopImmediatePropagation();
        const { SystemAdapter } = globalThis.ShipCombat._api;
        const sys     = SystemAdapter.current.getShipData(this.actor);
        const adapter = SystemAdapter.current;
        const pil     = sys.attributes?.piloting ?? 0;
        const pilStr  = `${pil >= 0 ? "+" : ""}${pil}`;
        const roll    = await new Roll("1d20 + @mod", { mod: pil }).evaluate();
        const sl      = adapter.computeSuccessLevel(roll, pil);
        const baseFlavor = `${game.i18n.localize("SHIPCOMBAT.Helm.RollPiloting")} (PIL ${pilStr})`;
        const msg = await roll.toMessage({
          flavor:  adapter.buildSkillRollFlavor(baseFlavor, roll, sl),
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        });
        await this.actor.update({
          [SystemAdapter.current.systemPath("resources.pilot.pilotingSL")]:       Math.max(0, sl),
          [SystemAdapter.current.systemPath("resources.pilot.pilotingMessageId")]: msg.id,
        });
      }, true /* capture */);
    }

    // ── Ordnance / Gunnery (RNG) ───────────────────────────────────────────
    for (const btn of root.querySelectorAll("[data-action='npcRollOrdnance']")) {
      btn.addEventListener("click", async (event) => {
        event.stopImmediatePropagation();
        const { SystemAdapter } = globalThis.ShipCombat._api;
        const sys = SystemAdapter.current.getShipData(this.actor);
        if (sys.resources?.gunner?.ordnanceRolled) {
          return ui.notifications.warn(game.i18n.localize("SHIPCOMBAT.Warning.AlreadyRolledOrdnance"));
        }
        const adapter = SystemAdapter.current;
        const rng     = sys.attributes?.gunnery ?? 0;
        const rngStr  = `${rng >= 0 ? "+" : ""}${rng}`;
        const roll    = await new Roll("1d20 + @mod", { mod: rng }).evaluate();
        const sl      = Math.max(0, adapter.computeSuccessLevel(roll, rng));
        const baseFlavor = `${game.i18n.localize("SHIPCOMBAT.NpcShip.Gunnery")} (RNG ${rngStr})`;
        await roll.toMessage({
          flavor:  adapter.buildSkillRollFlavor(baseFlavor, roll, sl),
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        });
        await this.actor.update({
          [SystemAdapter.current.systemPath("resources.gunner.ordnanceSL")]:       sl,
          [SystemAdapter.current.systemPath("resources.gunner.ordnanceRolled")]:   true,
          [SystemAdapter.current.systemPath("resources.gunner.allocAccuracy")]:    0,
          [SystemAdapter.current.systemPath("resources.gunner.allocPenetration")]: 0,
          [SystemAdapter.current.systemPath("resources.gunner.allocFirepower")]:   0,
          [SystemAdapter.current.systemPath("resources.gunner.slLocked")]:         false,
        });
      }, true /* capture */);
    }

    // ── Suppress Fire (ENG) ────────────────────────────────────────────────
    for (const btn of root.querySelectorAll("[data-action='npcSuppressFire']")) {
      btn.addEventListener("click", async (event) => {
        event.stopImmediatePropagation();
        const { SystemAdapter } = globalThis.ShipCombat._api;
        const sys = SystemAdapter.current.getShipData(this.actor);
        if (sys.engActionUsed) return ui.notifications.warn(game.i18n.localize("SHIPCOMBAT.NpcShip.EngActionUsed"));
        if ((sys.internalFire ?? 0) <= 0) return;
        const adapter  = SystemAdapter.current;
        const eng      = sys.attributes?.tech ?? 0;
        const engStr   = `${eng >= 0 ? "+" : ""}${eng}`;
        const roll     = await new Roll("1d20 + @mod", { mod: eng }).evaluate();
        const sl       = adapter.computeSuccessLevel(roll, eng);
        const reduction = Math.max(0, 5 + sl);
        const curFire  = sys.internalFire ?? 0;
        const newFire  = Math.max(0, curFire - reduction);
        const calcSnippet = `<div class="sc-eng-result">Fire suppressed by: 5 + ${sl} = ${reduction} &nbsp;(${curFire} → ${newFire})</div>`;
        const baseFlavor = `${game.i18n.localize("SHIPCOMBAT.NpcShip.SuppressFire")} (${game.i18n.localize("SHIPCOMBAT.NpcShip.Tech")} ENG ${engStr})\n${calcSnippet}`;
        await roll.toMessage({ flavor: adapter.buildSkillRollFlavor(baseFlavor, roll, sl), speaker: ChatMessage.getSpeaker({ actor: this.actor }) });
        await this.actor.update({
          [SystemAdapter.current.systemPath("internalFire")]:  newFire,
          [SystemAdapter.current.systemPath("engActionUsed")]: true,
        });
      }, true /* capture */);
    }

    // ── Reduce Heat (ENG) ──────────────────────────────────────────────────
    for (const btn of root.querySelectorAll("[data-action='npcReduceHeat']")) {
      btn.addEventListener("click", async (event) => {
        event.stopImmediatePropagation();
        const { SystemAdapter } = globalThis.ShipCombat._api;
        const sys = SystemAdapter.current.getShipData(this.actor);
        if (sys.engActionUsed) return ui.notifications.warn(game.i18n.localize("SHIPCOMBAT.NpcShip.EngActionUsed"));
        if ((sys.heat ?? 0) <= 0) return;
        const adapter  = SystemAdapter.current;
        const eng      = sys.attributes?.tech ?? 0;
        const engStr   = `${eng >= 0 ? "+" : ""}${eng}`;
        const roll     = await new Roll("1d20 + @mod", { mod: eng }).evaluate();
        const sl       = adapter.computeSuccessLevel(roll, eng);
        const reduction = Math.max(0, 5 + sl);
        const curHeat  = sys.heat ?? 0;
        const newHeat  = Math.max(0, curHeat - reduction);
        const calcSnippet = `<div class="sc-eng-result">Heat reduced by: 5 + ${sl} = ${reduction} &nbsp;(${curHeat} → ${newHeat})</div>`;
        const baseFlavor = `${game.i18n.localize("SHIPCOMBAT.NpcShip.ReduceHeat")} (${game.i18n.localize("SHIPCOMBAT.NpcShip.Tech")} ENG ${engStr})\n${calcSnippet}`;
        await roll.toMessage({ flavor: adapter.buildSkillRollFlavor(baseFlavor, roll, sl), speaker: ChatMessage.getSpeaker({ actor: this.actor }) });
        await this.actor.update({
          [SystemAdapter.current.systemPath("heat")]:          newHeat,
          [SystemAdapter.current.systemPath("engActionUsed")]: true,
        });
      }, true /* capture */);
    }

    // Injected Flux Max input — uses data-system-field instead of name= so it
    // doesn't duplicate system.voidshieldFlux in the form data (which would
    // cause FormDataExtended to produce an array, resolving to NaN).
    const fluxInput = root.querySelector("[data-system-field='voidshieldFlux']");
    if (fluxInput) {
      fluxInput.addEventListener("change", async (event) => {
        const value = Number(event.currentTarget.value);
        if (Number.isFinite(value)) {
          await this.actor.update({ "system.voidshieldFlux": value });
        }
      });
    }

    // Initialize Tagify autocomplete on the traits row.
    // loadTagify() loads the memoised Tagify class from the active system's vendor bundle.
    const traitsEl = root.querySelector("tagify-tags[name='system.traits.value']");
    if (traitsEl?.input) {
      (async () => {
        const TagifyCtor = await loadTagify();
        const creatureTraits = CONFIG.PF2E?.creatureTraits ?? {};
        const whitelist = Object.entries(creatureTraits)
          .map(([id, locPath]) => ({
            id,
            value: game.i18n.localize(typeof locPath === "string" ? locPath : locPath.label),
          }))
          .sort((a, b) => a.value.localeCompare(b.value, game.i18n.lang));
        new TagifyCtor(traitsEl.input, {
          enforceWhitelist: true,
          keepInvalidTags: false,
          skipInvalid: true,
          maxTags: whitelist.length,
          dropdown: { enabled: 0, maxItems: whitelist.length, searchKeys: ["id", "value"] },
          editTags: { clicks: 2, keepInvalid: true },
          delimiters: ",",
          whitelist,
        });
      })();
    }

    // IWR edit buttons — open the shared ShipIWREditor popup.
    root.querySelector("[data-action='editImmunities']")?.addEventListener("click", () => {
      new ShipIWREditor(this.actor, "di").render(true);
    });
    root.querySelector("[data-action='editWeaknesses']")?.addEventListener("click", () => {
      new ShipIWREditor(this.actor, "dv").render(true);
    });
    root.querySelector("[data-action='editResistances']")?.addEventListener("click", () => {
      new ShipIWREditor(this.actor, "dr").render(true);
    });

    // Elite/Weak adjustment toggle buttons — mirrors SF2e's applyAdjustment().
    // Adjusts hull.max by the level-based HP delta (same table as SF2e NPCs)
    // and shifts piloting/tech/gunnery by ±2.
    for (const btn of root.querySelectorAll("[data-action='adjust-elite-weak']")) {
      btn.addEventListener("click", async () => {
        const adjustment = btn.dataset.adjustment;         // "elite" | "weak"
        const sys        = this.actor.system;
        const current    = sys.details?.adjustment ?? "";  // current stored value
        const newAdj     = current === adjustment ? "" : adjustment; // toggle off if same

        const level = sys.details?.level?.value ?? 1;

        // HP delta table (mirrors sf2e getHpAdjustment)
        function hpDelta(lvl, adj) {
          if (adj === "elite") {
            if (lvl >= 20) return 30;
            if (lvl >= 5)  return 20;
            if (lvl >= 2)  return 15;
            return 10;
          }
          if (adj === "weak") {
            if (lvl >= 21) return -30;
            if (lvl >= 6)  return -20;
            if (lvl >= 3)  return -15;
            return -10;
          }
          return 0;
        }

        const currentHpDelta = hpDelta(level, current);
        const newHpDelta      = hpDelta(level, newAdj);
        const hullMaxDelta    = newHpDelta - currentHpDelta;

        // Attribute modifier: ±2 (elite +2, weak -2, none 0)
        function attrMod(adj) {
          return adj === "elite" ? 2 : adj === "weak" ? -2 : 0;
        }
        const attrDelta = attrMod(newAdj) - attrMod(current);

        const newHullMax = Math.max(1, (sys.hull?.max ?? 1) + hullMaxDelta);
        const newHullVal = Math.min(sys.hull?.value ?? 0, newHullMax);

        await this.actor.update({
          "system.details.adjustment":  newAdj,
          "system.hull.max":            newHullMax,
          "system.hull.value":          newHullVal,
          "system.attributes.piloting": (sys.attributes?.piloting ?? 40) + attrDelta,
          "system.attributes.tech":     (sys.attributes?.tech     ?? 40) + attrDelta,
          "system.attributes.gunnery":  (sys.attributes?.gunnery  ?? 40) + attrDelta,
        });

        // Immediately apply adjustment class to form for visual feedback
        // (sheet re-render may lag; this ensures CSS color rules fire at once)
        const form = root.closest('form');
        if (form) {
          form.classList.remove('adjustment-elite', 'adjustment-weak');
          if (newAdj) form.classList.add(`adjustment-${newAdj}`);
        }
      });
    }
  }
}
