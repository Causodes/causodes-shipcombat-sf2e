/**
 * Sf2eAdapter — Starfinder 2e implementation of SystemAdapter.
 *
 * STATUS: Phases 1 + 3 complete (base classes, skill resolution).
 * Phase 2 (storage redirect) is NOT needed — the module owns the
 * "causodes-shipcombat-sf2e.ship" actor type and stores data in system.*,
 * so the base SystemAdapter.getShipData() / systemPath() defaults apply.
 * See `docs/sf2e-v1-migration.md` for the full migration plan.
 *
 * The base class throws on most getters by default. Because this stub does
 * NOT register any actor sheets, item sheets, or data models, those throwing
 * getters are never invoked at module-evaluation time — they will only fire
 * once a phase activates the corresponding feature and we provide an
 * implementation here.
 */

const { SystemAdapter, emitToGM } = globalThis.ShipCombat._api;
const MODULE_ID = "causodes-shipcombat-sf2e";

// ── Skill map: abstract role key → SF2e skill slug ────────────────────────
// Confirmed against CONFIG.PF2E.skills in sf2e.mjs. SF2e-specific skills
// (computers, piloting) are registered by the system and live alongside
// the standard PF2e core-skill list.
const SKILL_MAP = {
  leadership:  { key: "diplomacy"  },  // captain / command — CHA
  engineering: { key: "crafting"   },  // repairs & power management — INT
  pilot:       { key: "piloting"   },  // helm — DEX (SF2e-specific)
  sensors:     { key: "computers"  },  // sensor station — INT (SF2e-specific)
  ordnance:    { key: "athletics"  },  // loading / arming — STR
  gunner:      { key: "acrobatics" },  // targeting under pressure — DEX
  navigation:  { key: "piloting"   },  // astrogation — DEX
};

// ── Fallback skills for bare pf2e (no sf2e-anachronism) ──────────────────
// Maps SF2e-specific slugs to the closest pf2e core equivalent by ability score.
// Used only when the slug is absent from CONFIG.PF2E.skills at runtime.
const FALLBACK_SKILLS = {
  piloting:  "acrobatics",  // DEX → DEX
  computers: "crafting",    // INT → INT (crafting is already in SKILL_MAP for engineering)
};

export class Sf2eAdapter extends SystemAdapter {
  get systemName()     { return "Starfinder 2e"; }
  get moduleId()       { return MODULE_ID; }
  get englishVariant() { return "american"; }

  /* ── Phase 1 — Base class wiring ───────────────────────────────────────── */

  /**
   * Base class for the V1 ship sheet.  We deliberately use the bare Foundry
   * AppV1 `ActorSheet` rather than any PF2e sheet class:
   *
   *   - Our ship is a fully custom actor type (not a PF2e vehicle), so its
   *     prepareData chain is plain Foundry — extending a PF2e sheet would
   *     read schema fields that don't exist on `ShipModel`.
   *   - Foundry's base ActorSheet is available at module-eval time, removing
   *     the registration-timing dance we needed when this getter resolved
   *     against `CONFIG.Actor.sheetClasses`.
   */
  get SheetBaseClassV1() {
    return foundry.appv1.sheets.ActorSheet;
  }

  /** SF2e / PF2e do not style AppV2 `.application` elements; use AppV1 everywhere. */
  get useApplicationV1() { return true; }

  /**
   * SF2e's ActorSystemModel extends TypeDataModel but is not publicly exported.
   * TypeDataModel is the correct public base for our adapter models.
   */
  get ActorModelBaseClass() { return foundry.abstract.TypeDataModel; }

  get ItemModelBaseClass()  { return foundry.abstract.TypeDataModel; }

  /**
   * Base class for AppV2 actor sheets (used by NpcShipSheet, OrdnanceSheet).
   */
  get SheetBaseClass() {
    return foundry.applications.sheets.ActorSheetV2;
  }

  /**
   * SF2e tracks hull as HP remaining (like standard RPG hit points), so the
   * "HP Remaining" display path is the natural fit for this system.
   */
  get hullDisplayMode() { return "hpRemaining"; }

  /**
   * Base class for AppV2 item sheets (used by ShipComponentSheet).
   * foundry.applications.sheets.ItemSheetV2 is the Foundry-native AppV2 item
   * sheet base — same class that warhammer-lib wraps in WarhammerItemSheetV2.
   */
  get ItemSheetBaseClass() {
    return foundry.applications.sheets.ItemSheetV2;
  }

  /* ── Phase 3 — Skill resolution ────────────────────────────────────────── */

  resolveSkill(roleSkill) {
    const mapped = SKILL_MAP[roleSkill];
    if (mapped) return { ...mapped, key: this._resolveSkillSlug(mapped.key) };

    // Accept a plain slug string (possibly with "|spec" suffix — SF2e has no
    // specialisations, so we strip the suffix and use the slug directly).
    const slug = typeof roleSkill === "string"
      ? roleSkill.slice(0, roleSkill.includes("|") ? roleSkill.indexOf("|") : undefined)
      : null;
    if (slug?.length) return { key: this._resolveSkillSlug(slug) };

    throw new Error(`Sf2eAdapter: unknown roleSkill "${roleSkill}"`);
  }

  /**
   * Return a human-readable label for an SF2e skill slug.
   * Reads CONFIG.PF2E.skills, which is populated before any module init hook.
   */
  getSkillLabel(key) {
    if (key === "perception") return game.i18n.localize("PF2E.PerceptionLabel");
    if (key.startsWith("martial:"))  return this._getProficiencyLabel(key.slice(8), "attacks");
    if (key.startsWith("defense:"))  return this._getProficiencyLabel(key.slice(8), "defenses");
    if (key.startsWith("spell:")) {
      // No actor context here; humanise the slug as best we can.
      return key.slice(6).replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    }
    const entry = CONFIG.PF2E?.skills?.[key];
    if (entry?.label) return game.i18n.localize(entry.label);
    // Fallback: capitalise the slug.
    return String(key ?? "").replace(/^\w/, c => c.toUpperCase());
  }

  /**
   * Default mapping from bridge role → primary skill.
   * SF2e uses plain skill slugs; no specialisation strings needed.
   */
  getDefaultRoleSkillMapping() {
    // Resolve sf2e-specific slugs at runtime so bare pf2e worlds (without
    // sf2e-anachronism) get a working pf2e fallback skill instead of a
    // missing slug that produces no modifier.
    const computers = this._resolveSkillSlug("computers");
    const piloting  = this._resolveSkillSlug("piloting");
    // Label keys exist in en.json for all possible resolved values.
    const LABEL_KEYS = {
      computers:  "SHIPCOMBAT.SF2E.MainSkill.Computers",
      crafting:   "SHIPCOMBAT.SF2E.MainSkill.Crafting",
      piloting:   "SHIPCOMBAT.SF2E.MainSkill.Piloting",
      acrobatics: "SHIPCOMBAT.SF2E.MainSkill.Acrobatics",
    };
    return {
      captain:  { skillKey: "diplomacy",  specialisation: "", rootLabel: "Diplomacy",                    label: "SHIPCOMBAT.SF2E.MainSkill.Diplomacy"   },
      engineer: { skillKey: computers,    specialisation: "", rootLabel: this.getSkillLabel(computers),  label: LABEL_KEYS[computers]  ?? `SHIPCOMBAT.SF2E.MainSkill.${computers.charAt(0).toUpperCase() + computers.slice(1)}`  },
      pilot:    { skillKey: piloting,     specialisation: "", rootLabel: this.getSkillLabel(piloting),   label: LABEL_KEYS[piloting]   ?? `SHIPCOMBAT.SF2E.MainSkill.${piloting.charAt(0).toUpperCase() + piloting.slice(1)}`   },
      sensors:  { skillKey: "perception", specialisation: "", rootLabel: "Perception",                  label: "SHIPCOMBAT.SF2E.MainSkill.Perception"  },
      gunner:   { skillKey: "acrobatics", specialisation: "", rootLabel: "Acrobatics",                  label: "SHIPCOMBAT.SF2E.MainSkill.Acrobatics"  },
      ordnance: { skillKey: "athletics",  specialisation: "", rootLabel: "Athletics",                   label: "SHIPCOMBAT.SF2E.MainSkill.Athletics"   },
    };
  }

  /** Only PF2e/SF2e character actors can serve as crew members. */
  isCrewActorEligible(actor) {
    return actor?.type === "character";
  }

  /* ── Phase 4 — d20 roll mechanics ──────────────────────────────────────── */

  /** Ship combat uses d20 (SF2e is PF2e-based). */
  getRollFormula() { return "1d20"; }

  /**
   * PF2e modifier steps are whole integers (no ×10 scaling).
   * The engine uses this for stance, lock-tier, and BDA adjustments.
   */
  getModifierStepSize() { return 1; }

  /** SF2e fixed hit bonuses (lock, BDA, ranging fire) use +2 steps. */
  getHitBonusStep() { return 2; }

  /** SF2e: weapons can reach up to 20 bands beyond their effective range (max penalty −20). */
  getMaxDecayBands(_sensorRating) { return 20; }

  /** SF2e chat card shows only the hit modifier; AC is for the Radar Operator. */
  formatChatAccuracyDisplay(_effectiveAccuracy, _targetAC) { return null; }

  /** Show the attack bonus as "+N to hit vs AC X" in the salvo summary. */
  formatChatHitMod(effectiveAccuracy, targetAC = null) {
    if (effectiveAccuracy === null) return null;
    const base = `+${effectiveAccuracy} to hit`;
    return targetAC !== null ? `${base} vs AC ${targetAC}` : base;
  }

  /** "+N" / "−N" with explicit sign. */
  formatModifier(value) {
    return `${value >= 0 ? "+" : ""}${value}`;
  }

  /** "DC N" — standard PF2e/SF2e phrasing. */
  formatTargetNumber(target) {
    return `DC ${target}`;
  }

  /**
   * Display the total attack bonus together with the target's AC in the
   * targeting popup (e.g. "+5 (AC 18)").  When the target AC is unknown,
   * shows the signed bonus alone.
   */
  formatAccuracyDisplay(totalAccuracy, _targetAC = null, _hitChance = null) {
    return this.formatModifier(totalAccuracy);
  }

  /** "(N Points)" — SF2e BDA uses Points rather than SL. */
  formatBdaBadge(sl) { return `(${sl} Points)`; }

  /**
   * SL ladder for ship actions.  Target number is intentionally unused;
   * all ship actions use the same fixed threshold:
   *   roll ≤ 14  → SL 0 (failure)
   *   roll 15–19 → SL 1 (success)
   *   roll 20+   → SL 2 (critical success)
   *
   * Natural 20 increases the points awarded by 1; natural 1 decreases by 1.
   * Formula (before nat adjustment): Math.floor((total - 10) / 5)
   */
  computeSuccessLevel(roll, _target) {
    const base = Math.floor(((roll?.total ?? 0) - 10) / 5);
    return base + this._getNatBonus(roll);
  }

  /**
   * Return the nat-20/1 points adjustment for a roll: +1 for a natural 20,
   * −1 for a natural 1, 0 otherwise.  Uses the active die result so that
   * fortune/misfortune (2d20kh / 2d20kl) is handled correctly.
   *
   * @param {Roll|null} roll
   * @returns {-1|0|1}
   */
  _getNatBonus(roll) {
    const d = roll?.dice?.[0]?.results?.[0]?.result ?? 0;
    return d === 20 ? 1 : d === 1 ? -1 : 0;
  }

  /**
   * Build the SC Points DC table HTML block.
   *
   * Generates a self-contained `<div class="sc-points-table">` that includes
   * the roll-threshold table, an optional nat-20/1 indicator, and the
   * "→ Points Granted" footer.  The outer div class is used by the
   * `renderChatMessage` hook to identify messages that need dynamic SL
   * updates after a reroll.
   *
   * Always shows row 0 (≤14), then the row before the active, the active
   * row, and the next row — with "…" if there is a gap after row 0.
   * The active row is determined by the BASE SL (before nat adjustment) so
   * the player can see exactly where their roll landed in the table.  The
   * "Points Granted" footer shows the FINAL adjusted value.
   *
   * @param {number}  finalSL   Adjusted points granted (≥ 0).
   * @param {string}  [roleSkill=""]  Role skill key stored as data-sc-role-skill
   *                                  so the createChatMessage reroll handler can
   *                                  re-emit the SL to the ship sheet.
   * @param {number}  [natBonus=0]    −1, 0, or +1 nat adjustment to show indicator.
   * @returns {string}   HTML string.
   */
  buildPointsTableHtml(finalSL, roleSkill = "", natBonus = 0) {
    const range = (n) =>
      n === 0 ? "\u226414" : `${10 + 5 * n}\u2013${14 + 5 * n}`;

    // Highlight the row where the roll total falls (before nat adjustment)
    const tableSL = Math.max(0, finalSL - natBonus);

    const showSet = new Set([0]);
    if (tableSL > 1) showSet.add(tableSL - 1);
    showSet.add(tableSL);
    showSet.add(tableSL + 1);
    const indices = [...showSet].sort((a, b) => a - b);

    let tableRows = "";
    for (let i = 0; i < indices.length; i++) {
      const idx  = indices[i];
      const prev = indices[i - 1] ?? -1;
      if (idx > prev + 1) {
        tableRows += `<tr class="sc-sl-row sc-sl-row--ellipsis"><td colspan="2">…</td></tr>`;
      }
      const active = idx === tableSL;
      tableRows += `<tr class="sc-sl-row${active ? " sc-sl-row--active" : ""}">
        <td>${range(idx)}</td><td>${idx}</td>
      </tr>`;
    }

    let natNote = "";
    if (natBonus === 1) {
      natNote = `<div class="sc-nat-bonus sc-nat-20">Natural 20: +1 point</div>`;
    } else if (natBonus === -1) {
      natNote = `<div class="sc-nat-bonus sc-nat-1">Natural 1: \u22121 point</div>`;
    }

    const roleAttr = roleSkill ? ` data-sc-role-skill="${roleSkill}"` : "";
    return `<div class="sc-points-table"${roleAttr}>
      <table class="sc-sl-table">
        <thead><tr><th>Roll</th><th>Points</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>${natNote}
      <div class="sc-points-granted">→ Points Granted: <strong>${finalSL}</strong></div>
    </div>`;
  }

  /**
   * Enrich a chat message flavor with the SF2e Points DC table.
   * Thin wrapper around buildPointsTableHtml; preserved for callers that
   * need the base flavor prepended (e.g. fallback plain-Roll messages).
   */
  buildSkillRollFlavor(baseFlavor, roll, sl) {
    return `${baseFlavor}\n${this.buildPointsTableHtml(sl)}`;
  }

  /**
   * Post-process the most recently posted ChatMessage to inject the SC
   * Points table into its flavor.  Called after every rollSkillTest path
   * (preferred and fallback) so all roles get a consistent table card.
   *
   * Returns the message id, or null if no message was found.
   *
   * @param {Roll}   roll       The roll whose total is used to compute the SL.
   * @param {string} [roleSkill=""]  Embedded as data-sc-role-skill so the
   *                                  createChatMessage reroll hook can update
   *                                  the ship sheet after a PF2e reroll.
   * @returns {Promise<string|null>}
   */
  async _postAddPointsTable(roll, roleSkill = "") {
    const msg = game.messages.contents.at(-1);
    if (!msg) return null;
    const natBonus  = this._getNatBonus(roll);
    const finalSL   = Math.max(0, this.computeSuccessLevel(roll));
    const tableHtml = this.buildPointsTableHtml(finalSL, roleSkill, natBonus);
    const oldFlavor = msg.flavor ?? "";
    await msg.update({ flavor: `${oldFlavor}\n${tableHtml}` });
    return msg.id;
  }

  /**
   * Create and post a CheckRoll via the PF2e Check pipeline so that the
   * resulting chat message carries SF2e's reroll context menu options
   * (Hero Point, Keep New, Keep Lower, Keep Higher).
   *
   * Falls back to a plain Roll if the `game.pf2e` API is not yet ready.
   *
   * @param {Actor}  actor   Crew member character actor (owner of the check).
   * @param {number} mod     Static total modifier to apply.
   * @param {object} opts
   * @param {string} [opts.label]       Flavor label shown in the chat card.
   * @param {boolean} [opts.skipDialog] Whether to skip the modifier dialog.
   * @returns {Promise<Roll|null>}
   */
  async _checkRoll(actor, mod, { label = "Ship Combat", skipDialog = true } = {}) {
    const Check         = game.pf2e?.Check;
    const CheckModifier = game.pf2e?.CheckModifier;
    const Modifier      = game.pf2e?.Modifier;
    if (!Check || !CheckModifier || !Modifier) {
      // game.pf2e not ready — fall back to a plain Roll (no reroll menu).
      return new Roll("1d20 + @mod", { mod }).evaluate();
    }
    const modifier = new Modifier({ label, modifier: mod, type: "untyped" });
    const check    = new CheckModifier(label, { modifiers: [modifier] });
    return Check.roll(check, {
      actor,
      type:         "skill-check",
      skipDialog,
      createMessage: true,
    }, null);
  }

  /**
   * Register the `renderChatMessage` hook that dynamically rebuilds the
   * SC Points table in any chat message that contains one.  This ensures
   * the highlighted row and "Points Granted" text always reflect the
   * current roll total — including after a PF2e reroll, which deletes the
   * old message and creates a new one carrying the old flavor HTML.
   *
   * Also registers a `preDeleteChatMessage` / `createChatMessage` pair that
   * re-emits the updated SL to the ship sheet after a PF2e reroll.
   *
   * Why not `pf2e.reroll`?  PF2e passes `Roll.fromJSON(oldRollJSON)` to
   * that hook — a freshly constructed instance, not the cached Roll stored
   * in message._rolls — so any `===` identity lookup against game.messages
   * always fails.
   *
   * Why `preDeleteChatMessage`?  It fires synchronously on the local client
   * before the delete request reaches the server (i.e. only on the client
   * that triggered the reroll).  We stash the crew actor ID here; then when
   * `createChatMessage` fires for the replacement message we use it to look
   * up the ship role and emit the updated SL.  Other clients never set the
   * stash, so they silently skip the emit.
   *
   * Roles with multiple resource keys (engineer, sensors) are excluded.
   *
   * Call once during module init (see causodes-shipcombat-sf2e.js).
   */
  registerRenderHook() {
    Hooks.on("renderChatMessage", (message, html) => {
      const rootEl  = html instanceof HTMLElement ? html : html[0];
      if (!rootEl) return;
      const tableDiv = rootEl.querySelector(".sc-points-table");
      if (!tableDiv) return;

      const roll = message.rolls?.[0];
      if (!roll) return;

      const natBonus  = this._getNatBonus(roll);
      const finalSL   = Math.max(0, this.computeSuccessLevel(roll));
      const roleSkill = tableDiv.dataset?.scRoleSkill ?? "";

      // Rebuild the table in place so the active row and point count are
      // always correct for the roll stored in this message.
      const tmp = document.createElement("div");
      tmp.innerHTML = this.buildPointsTableHtml(finalSL, roleSkill, natBonus);
      const newTable = tmp.firstElementChild;
      if (newTable) tableDiv.replaceWith(newTable);
    });

    // ── Re-emit SL to ship sheet after a PF2e reroll ─────────────────────
    // Maps bridge role names (as stored in ship.system.crewActors) to the
    // corresponding ship-sheet resource key.
    const ROLE_RESOURCE_MAP = {
      gunner:   { roleId: "gunner",   key: "ordnanceSL" },
      captain:  { roleId: "captain",  key: "leadershipSL" },
      pilot:    { roleId: "pilot",    key: "pilotingSL" },
      ordnance: { roleId: "ordnance", key: "bosunSL" },
      // engineer / sensors omitted: same roleSkill covers multiple actions
    };

    // Stash the speaker actor ID of any points-roll message being deleted.
    // preDeleteChatMessage fires only on the local (initiating) client.
    let _pendingRerollActorId = null;

    Hooks.on("preDeleteChatMessage", (message) => {
      const tmp = document.createElement("div");
      tmp.innerHTML = message.flavor ?? "";
      if (!tmp.querySelector(".sc-points-table")) return;
      _pendingRerollActorId = message.speaker?.actor ?? null;
    });

    Hooks.on("createChatMessage", (message) => {
      if (!_pendingRerollActorId) return;
      const speakerActorId = _pendingRerollActorId;
      _pendingRerollActorId = null;

      // Only act on PF2e reroll results that carry our table.
      if (!message.flags?.[game.system.id]?.context?.isReroll) return;
      const tmp = document.createElement("div");
      tmp.innerHTML = message.flavor ?? "";
      if (!tmp.querySelector(".sc-points-table")) return;

      const roll = message.rolls?.[0];
      if (!roll) return;

      // Search every ship actor for the role that has this crew member.
      // Ship actors are identified by the presence of system.crewActors.
      for (const shipActor of game.actors.contents) {
        const crewActors = shipActor.system?.crewActors;
        if (!crewActors) continue;

        for (const [roleName, resource] of Object.entries(ROLE_RESOURCE_MAP)) {
          const ref = crewActors[roleName];
          if (!ref?.uuid) continue;
          // UUID format: "Actor.<id>" — extract the trailing segment.
          const refActorId = ref.uuid.split(".").at(-1);
          if (refActorId !== speakerActorId) continue;

          const newSL = Math.max(0, this.computeSuccessLevel(roll));
          emitToGM("updateResource", { roleId: resource.roleId, key: resource.key, value: newSL });
          return;
        }
      }
    });
  }

  /**
   * Return the target ship's Armour Class for d20 hit resolution.
   * SF2e ships store the computed AC at `actor.system.armorClass`.
   */
  getTargetAC(actor) {
    const baseAC = actor?.system?.armorClass ?? null;
    if (baseAC === null) return null;
    const allocEvasion = actor?.system?.resources?.pilot?.allocEvasion ?? 0;
    return baseAC + allocEvasion;
  }

  /**
   * Hit when d20 + effectiveAccuracy (total attack bonus) ≥ target AC.
   * Falls back to DC 15 when no target AC is available (e.g. ordnance or
   * actors that haven't computed their armorClass yet).
   */
  /**
   * Compute the final hit tier for a roll, applying PF2e/SF2e nat-20 promotion
   * and nat-1 demotion rules on top of the margin-based result.
   *
   * Returns: 'crit' | 'hit' | 'miss' | 'crit_miss'
   *
   * Tier boundaries (before nat-20/1 adjustment):
   *   total ≥ dc + critMargin  →  crit
   *   total ≥ dc               →  hit
   *   total ≥ dc − 9           →  miss       (fail by 1–9)
   *   total ≤ dc − 10          →  crit_miss  (fail by 10+)
   *
   * Nat 20 promotes one degree  (crit_miss→miss, miss→hit, hit→crit).
   * Nat  1 demotes  one degree  (crit→hit, hit→miss, miss→crit_miss).
   */
  _getHitTier(roll, accuracy, targetAC, traits = {}) {
    const dc = targetAC ?? 15;
    const devastating = traits?.devastating ?? 0;
    const ffeReduction = traits?.ffeReduction ?? 0;
    const critMargin = Math.max(0, 10 - devastating - ffeReduction);
    const dieValue = roll?.dice?.[0]?.results?.[0]?.result ?? 0;
    const total = (roll?.total ?? 0) + accuracy;

    // Determine base tier (4 degrees)
    let tier;
    if      (total >= dc + critMargin) tier = "crit";
    else if (total >= dc)              tier = "hit";
    else if (total > dc - 10)          tier = "miss";      // fail by 1–9
    else                               tier = "crit_miss"; // fail by 10+

    // Nat 20: promote one degree
    if (dieValue === 20) {
      if      (tier === "crit_miss") tier = "miss";
      else if (tier === "miss")      tier = "hit";
      else if (tier === "hit")       tier = "crit";
      // crit stays crit
    }
    // Nat 1: demote one degree
    else if (dieValue === 1) {
      if      (tier === "crit")      tier = "hit";
      else if (tier === "hit")       tier = "miss";
      else if (tier === "miss")      tier = "crit_miss";
      // crit_miss stays crit_miss
    }

    return tier;
  }

  isHit(roll, accuracy, targetAC = null) {
    const tier = this._getHitTier(roll, accuracy, targetAC);
    return tier === "hit" || tier === "crit";
  }

  /**
   * Critical hit when the attack's final tier (after nat-20/1 adjustments) is
   * "crit" — i.e., exceeds AC by the crit margin, or was promoted there by a
   * nat-20. The Devastating trait lowers the crit margin by 1 per point (min 0).
   */
  isCriticalHit(roll, accuracy, targetAC = null, traits = {}) {
    return this._getHitTier(roll, accuracy, targetAC, traits) === "crit";
  }

  /**
   * A weapon with the Unreliable trait jams on a critical failure (tier
   * "crit_miss"): failing by 10 or more after nat-20/1 adjustments.
   * A nat-1 that would have been a hit becomes a miss — not a critical failure —
   * so it does NOT jam; only a nat-1 on an already-failing roll demotes to
   * crit_miss and triggers the jam.
   */
  isJam(roll, accuracy, traits, targetAC = null) {
    if (!traits?.unreliable) return false;
    return this._getHitTier(roll, accuracy, targetAC, traits) === "crit_miss";
  }

  /**
   * A critical failure (for chip styling) is any outcome whose final tier is
   * "crit_miss" — fail by 10+ after nat-20/1 adjustments, regardless of
   * whether the weapon is Unreliable.
   */
  isCriticalMiss(roll, accuracy, targetAC = null, traits = {}) {
    return this._getHitTier(roll, accuracy, targetAC, traits) === "crit_miss";
  }

  /**
   * SF2e uses per-crit-hit rolling: each shot that crits generates one Low-tier
   * crit roll. Devastation Protocol counts every hit through shield as a crit.
   */
  getCritHitCount(salvoRolls, hitsThroughShield, isDevastation) {
    const critHits = salvoRolls.filter(r => r.hit && r.isCrit).length;
    return isDevastation ? Math.max(critHits, hitsThroughShield) : critHits;
  }

  /**
   * Return immunities, weaknesses, and resistances for an SF2e ship actor.
   * Used by the sensor-radar Lock-4 popup drawer.
   */
  getIWR(actor) {
    const traits = actor?.system?.traits;
    if (!traits) return null;
    return {
      immunities:  traits.di ?? [],
      weaknesses:  traits.dv ?? [],
      resistances: traits.dr ?? [],
    };
  }

  /**
   * Extract { SL, roll } from a posted ChatMessage.
   * PF2e stores rolls in `message.rolls`; we recompute SL from the total.
   */
  parseRollResultFromMessage(message) {
    const roll = message?.rolls?.[0] ?? null;
    if (!roll) return { SL: null, roll: null };
    return { SL: this.computeSuccessLevel(roll), roll };
  }

  /* ── Phase 5 — Skill / initiative roll API ──────────────────────────────── */

  /**
   * Roll a skill check for a crew member using PF2e's full modifier pipeline.
   * Falls back to a CheckRoll built from a bare modifier when the actor's
   * skill tree isn't ready or the key doesn't map to a Statistic.
   *
   * All three code paths:
   *   1. Proficiency-based keys (martial:/defense:/spell:) — no Statistic
   *      object; use _checkRoll() so the message is still a CheckRoll with
   *      SF2e reroll context menu options.
   *   2. Preferred — PF2e full pipeline via skill.check.roll().
   *   3. Fallback  — skill exists but .check.roll is absent; use _checkRoll().
   *
   * After every path, _postAddPointsTable() appends the DC table to the
   * newly created message.  The renderChatMessage hook (registered once
   * during init via registerRenderHook()) then keeps the table up-to-date
   * after any subsequent PF2e reroll.
   *
   * @returns {Promise<{SL: number, succeeded: boolean, roll: Roll, messageId: string|null}|null>}
   *   null when the roll dialog is cancelled.
   */
  async rollSkillTest(crewActor, roleSkill, options = {}) {
    const { key } = this.resolveSkill(roleSkill);

    // ── Path 1: Proficiency-based keys — no Statistic object available ──────
    if (key.startsWith("martial:") || key.startsWith("defense:") || key.startsWith("spell:")) {
      const mod   = this.getSkillScore(crewActor, key) ?? 0;
      const label = this.getSkillLabel(key);
      const roll  = await this._checkRoll(crewActor, mod, { label, skipDialog: true });
      if (!roll) return null;
      const SL        = this.computeSuccessLevel(roll);
      const messageId = await this._postAddPointsTable(roll, roleSkill);
      return { SL, succeeded: SL >= 1, roll, messageId };
    }

    // Perception is a separate Statistic in PF2e/SF2e — not in actor.skills
    const skill = key === "perception"
      ? (crewActor?.perception ?? crewActor?.skills?.perception)
      : crewActor?.skills?.[key];

    // ── Path 2: Preferred — PF2e full pipeline (posts CheckRoll automatically)
    if (skill?.check?.roll) {
      const roll = await skill.check.roll({
        event:      options.event,
        skipDialog: options.fastForward ?? false,
      });
      if (!roll) return null;  // user cancelled the modifier dialog
      const SL        = this.computeSuccessLevel(roll);
      const messageId = await this._postAddPointsTable(roll, roleSkill);
      return { SL, succeeded: SL >= 1, roll, messageId };
    }

    // ── Path 3: Fallback — skill exists but lacks check.roll; use _checkRoll
    const mod   = skill?.check?.mod ?? 0;
    const label = this.getSkillLabel(key);
    const roll  = await this._checkRoll(crewActor, mod, { label, skipDialog: true });
    if (!roll) return null;
    const SL        = this.computeSuccessLevel(roll);
    const messageId = await this._postAddPointsTable(roll, roleSkill);
    return { SL, succeeded: SL >= 1, roll, messageId };
  }

  /**
   * Roll ship initiative for a crew actor (posts a chat card).
   * Reads the static modifier off the skill; does NOT use the full PF2e
   * check pipeline so the result is a plain numeric total for the tracker.
   *
   * @returns {Promise<{total: number, roll: Roll, message: ChatMessage|null}>}
   */
  async rollShipInitiative(crewActor, roleSkill, options = {}) {
    const { key } = this.resolveSkill(roleSkill);
    let mod;
    if (key === "perception") {
      mod = crewActor?.system?.perception?.totalModifier ?? crewActor?.perception?.check?.mod ?? 0;
    } else if (key.startsWith("martial:") || key.startsWith("defense:") || key.startsWith("spell:")) {
      mod = this.getSkillScore(crewActor, key) ?? 0;
    } else {
      mod = crewActor?.skills?.[key]?.check?.mod ?? 0;
    }
    const flavor  = options.flavor
      ?? `${game.i18n.localize("SHIPCOMBAT.Initiative")} (${this.getSkillLabel(key)})`;

    const roll = await new Roll("1d20 + @mod", { mod }).evaluate();
    const msg  = await roll.toMessage({
      flavor,
      speaker: options.speaker ?? ChatMessage.getSpeaker({ actor: crewActor }),
    });
    return { total: roll.total, roll, message: msg ?? null };
  }

  /**
   * Initiative roll for NPC ships that store a raw numeric attribute rather
   * than a linked crew actor's skill tree.
   *
   * @returns {Promise<{total: number, roll: Roll, message: ChatMessage|null}>}
   */
  async rollShipInitiativeFromAttribute(attributeValue, flavorLabel, options = {}) {
    const roll = await new Roll("1d20 + @val", { val: attributeValue ?? 0 }).evaluate();
    const msg  = await roll.toMessage({
      flavor:  flavorLabel,
      speaker: options.speaker ?? {},
    });
    return { total: roll.total, roll, message: msg ?? null };
  }

  /**
   * d20 initiative totals are stored directly in the combat tracker — no
   * division or packing needed.
   */
  toCombatantInitiative(rawTotal, _shipActor) {
    return rawTotal;
  }

  /* ── Phase 6 — Hit resolution ───────────────────────────────────────────── */

  /**
   * Full hit resolution for a single fire event.
   * Rolls 1d20 + sum(modifiers), evaluates via the SL ladder, and posts a
   * chat card.
   *
   * @returns {Promise<{hit: boolean, sl: number, roll: Roll,
   *                    message: ChatMessage|null, displayTarget: null,
   *                    breakdownParts: string[]}>}
   */
  async resolveHitRoll(context) {
    const { modifiers = [], weaponItem, targetActor, options = {} } = context;

    const totalMod = modifiers.reduce((sum, m) => sum + (m.value ?? 0), 0);
    const roll     = await new Roll("1d20 + @mod", { mod: totalMod }).evaluate();
    const sl       = this.computeSuccessLevel(roll);
    const hit      = sl >= 1;
    const autoCrit = this.isAutomaticCrit(roll);

    const breakdownParts = modifiers
      .filter(m => m.value !== 0)
      .map(m => `${m.label ?? m.key ?? "?"}: ${this.formatModifier(m.value)}`);

    const flavor = options.flavor
      ?? (weaponItem?.name ?? game.i18n.localize("SHIPCOMBAT.Attack"));

    const msg = await roll.toMessage({
      flavor,
      speaker: options.speaker
        ?? (targetActor
          ? ChatMessage.getSpeaker({ actor: targetActor })
          : {}),
    });

    return { hit: hit || autoCrit, sl, roll, message: msg ?? null,
             displayTarget: null, breakdownParts };
  }

  /**
   * Returns all SF2e skills as selectable options for the role main-skill
   * dropdown.  Value format is "skillKey|" (empty spec since SF2e has no
   * specialisations).
   */
  async getRoleSkillOptions() {
    const skills  = CONFIG.PF2E?.skills ?? {};
    const options = Object.entries(skills).map(([key, def]) => ({
      value:    `${key}|`,
      skillKey: key,
      specName: "",
      label:    game.i18n.localize(def.label),
    }));
    // Perception is not in CONFIG.PF2E.skills but is a valid check in SF2e
    options.push({
      value:    "perception|",
      skillKey: "perception",
      specName: "",
      label:    game.i18n.localize("PF2E.PerceptionLabel"),
    });
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }

  /** @override — handle perception's separate data path and lore synthetic layer */
  getSkillScore(actor, skillKey) {
    if (!actor) return null;
    if (skillKey === "perception") {
      return actor.system?.perception?.totalModifier
        ?? actor.perception?.check?.mod
        ?? null;
    }
    // Attack proficiency (martial:key)
    if (skillKey.startsWith("martial:")) {
      return actor.system?.proficiencies?.attacks?.[skillKey.slice(8)]?.value ?? null;
    }
    // Defense proficiency (defense:key)
    if (skillKey.startsWith("defense:")) {
      return actor.system?.proficiencies?.defenses?.[skillKey.slice(8)]?.value ?? null;
    }
    // Spell attack modifier (spell:slug)
    if (skillKey.startsWith("spell:")) {
      const slug = skillKey.slice(6);
      // Use the same slug-resolution order as getActorExtraSkillOptions so the
      // lookup always finds the entry regardless of whether entry.slug is set.
      const entry = actor.itemTypes?.spellcastingEntry?.find(e => {
        const eSlug = e.slug
          ?? (typeof e.name === "string" ? e.name.slugify?.() : null)
          ?? e.id;
        return eSlug === slug;
      });
      return entry?.statistic?.mod ?? null;
    }
    // Standard skills: prefer the system (raw) data
    const sysSkill = actor.system?.skills?.[skillKey];
    if (sysSkill?.totalModifier != null) return sysSkill.totalModifier;
    if (sysSkill?.total         != null) return sysSkill.total;
    // Lore and other synthetic skills live in the prepared actor.skills layer
    const synthSkill = actor.skills?.[skillKey];
    return synthSkill?.check?.mod ?? synthSkill?.totalModifier ?? null;
  }

  /** @override — include lore skills, attack/defense proficiencies, and spell-attack entries */
  async getActorExtraSkillOptions(actor) {
    if (!actor) return [];
    const extras = [];

    // 1. Lore skills
    for (const loreItem of actor.itemTypes?.lore ?? []) {
      const slug = loreItem.slug
        ?? (typeof loreItem.name === "string" ? loreItem.name.slugify?.() : null)
        ?? "";
      const name = loreItem.name ?? slug;
      if (!slug) continue;
      extras.push({ value: `${slug}|`, skillKey: slug, specName: "", label: name });
    }

    // 2. Attack proficiencies (skip rank 0 and invisible)
    const attacks = actor.system?.proficiencies?.attacks ?? {};
    for (const [key, prof] of Object.entries(attacks)) {
      if (!prof || (prof.rank ?? 0) === 0) continue;
      const label = this._getProficiencyLabel(key, "attacks");
      extras.push({ value: `martial:${key}|`, skillKey: `martial:${key}`, specName: "", label });
    }

    // 3. Defense proficiencies (skip rank 0)
    const defenses = actor.system?.proficiencies?.defenses ?? {};
    for (const [key, prof] of Object.entries(defenses)) {
      if (!prof || (prof.rank ?? 0) === 0) continue;
      const label = this._getProficiencyLabel(key, "defenses");
      extras.push({ value: `defense:${key}|`, skillKey: `defense:${key}`, specName: "", label });
    }

    // 4. Spell attack modifiers (one entry per spellcasting entry that has a statistic)
    for (const entry of actor.itemTypes?.spellcastingEntry ?? []) {
      if (!entry.statistic) continue;
      // Prefer entry.slug; fall back to slugifying the entry name (readable),
      // and only use the raw Foundry ID as a last resort (avoids garbled labels).
      const slug  = entry.slug
        ?? (typeof entry.name === "string" ? entry.name.slugify?.() : null)
        ?? entry.id
        ?? "";
      const label = entry.name ?? game.i18n.localize("PF2E.SpellAttack");
      extras.push({ value: `spell:${slug}|`, skillKey: `spell:${slug}`, specName: "", label });
    }

    return extras;
  }

  /**
   * Returns the assigned pilot actor's Piloting skill total modifier,
   * for display in the helm skill-block roll row.
   * @param {Actor|null} actor
   * @returns {number|null}
   */
  getHelmRollModifier(actor) {
    const slug = this._resolveSkillSlug("piloting");
    return actor?.system?.skills?.[slug]?.totalModifier
      ?? actor?.system?.skills?.[slug]?.total
      ?? null;
  }

  /* ── Private helpers ────────────────────────────────────────────────────── */

  /**
   * Validate a skill slug against CONFIG.PF2E.skills at runtime and fall back
   * to a pf2e core equivalent if the slug is absent (e.g. "piloting" /
   * "computers" on bare pf2e without sf2e-anachronism).
   *
   * On sf2e all slugs are present, so this is a no-op and costs only a
   * property-existence check. On pf2e+anachronism the slugs are also present.
   * Only on bare pf2e (no anachronism) do the SF2e-specific slugs fall back.
   *
   * A console warning is emitted once per missing slug so the GM knows which
   * module to install for full Starfinder skill support.
   */
  _warnedFallbackSlugs = new Set();

  _resolveSkillSlug(slug) {
    const known = CONFIG.PF2E?.skills ?? {};
    if (slug === "perception" || slug in known) return slug;
    const fallback = FALLBACK_SKILLS[slug];
    const resolved = (fallback && (fallback === "perception" || fallback in known))
      ? fallback
      : ("perception" in known ? "perception" : Object.keys(known)[0] ?? slug);
    if (!this._warnedFallbackSlugs.has(slug)) {
      this._warnedFallbackSlugs.add(slug);
      console.warn(
        `[${MODULE_ID}] Skill "${slug}" not found in CONFIG.PF2E.skills. ` +
        `Install sf2e-anachronism on the pf2e system for full Starfinder skill support. ` +
        `Falling back to "${resolved}".`
      );
    }
    return resolved;
  }

  /**
   * Localise a value that is either already a readable string or a
   * localisation key (contains "." but no spaces).
   */
  _localizeIfKey(str) {
    if (typeof str !== "string") return String(str ?? "");
    return (str.includes(".") && !str.includes(" "))
      ? game.i18n.localize(str)
      : str;
  }

  /**
   * Return a human-readable label for a proficiency key.
   * @param {string} key       – e.g. "advanced-guns", "light", "weapon-group-bow"
   * @param {"attacks"|"defenses"} category
   */
  _getProficiencyLabel(key, category) {
    if (category === "attacks") {
      // weapon-group-X
      const gm = /^weapon-group-([-\w]+)$/.exec(key);
      if (gm) return this._localizeIfKey(CONFIG.PF2E?.weaponGroups?.[gm[1]] ?? gm[1]);
      // weapon-base-X
      const bm = /^weapon-base-([-\w]+)$/.exec(key);
      if (bm) return this._localizeIfKey(
        CONFIG.PF2E?.baseWeaponTypes?.[bm[1]] ?? CONFIG.PF2E?.baseShieldTypes?.[bm[1]] ?? bm[1]
      );
      // standard weapon category
      const v = CONFIG.PF2E?.weaponCategories?.[key];
      if (v) return this._localizeIfKey(v);
    } else {
      const v = CONFIG.PF2E?.armorCategories?.[key];
      if (v) return this._localizeIfKey(v);
    }
    // Fallback: humanise slug ("advanced-guns" → "Advanced Guns")
    return key.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Returns sorted damage type choices drawn from CONFIG.PF2E.damageTypes.
   * @returns {{ value: string, label: string }[]}
   */
  getDamageTypeChoices() {
    return Object.entries(CONFIG.PF2E?.damageTypes ?? {})
      .map(([value, labelKey]) => ({
        value,
        label: typeof labelKey === "string" && labelKey.includes(".")
          ? game.i18n.localize(labelKey)
          : (labelKey || value),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * SF2e weapons store damage as structured diceCount + dieSize fields
   * rather than a free-text formula string.
   * @param {Item} weapon
   * @returns {string}
   */
  getWeaponDamageFormula(weapon) {
    const { diceCount, dieSize } = weapon.system;
    return (diceCount != null && dieSize) ? `${diceCount}${dieSize}` : "0";
  }

  /**
   * Return a localized damage type label (e.g. "Piercing") drawn from
   * CONFIG.PF2E.damageTypes for the weapon's system.damageType key.
   * @param {Item} weapon
   * @returns {string|null}
   */
  getWeaponDamageType(weapon) {
    const type = weapon.system?.damageType;
    if (!type) return null;
    const labelKey = CONFIG.PF2E?.damageTypes?.[type];
    return labelKey ? game.i18n.localize(labelKey) : type;
  }

  /**
   * Ram collisions deal Bludgeoning damage in SF2e/PF2e.
   * @returns {string}
   */
  getRamDamageType() {
    const labelKey = CONFIG.PF2E?.damageTypes?.["bludgeoning"];
    return labelKey ? game.i18n.localize(labelKey) : "Bludgeoning";
  }

  /**
   * Apply SF2e damage-type interactions to a single hit's post-armour hull damage.
   *
   * Rules (simplified for ship combat):
   *   - Immunity   → 0 damage
   *   - Weakness   → ×2 damage
   *   - Resistance → ½ damage (floored)
   *
   * Data lives in system.traits on the ship actor:
   *   di  string[]                        — immunity type slugs
   *   dv  { type: string, value: number }[] — weaknesses
   *   dr  { type: string, value: number }[] — resistances
   *
   * @param {number} hullDamage
   * @param {string} damageType
   * @param {Actor}  targetActor
   * @returns {{ finalDamage: number, immune: boolean, note: string|null }}
   */
  modifyDamageForType(hullDamage, damageType, targetActor) {
    const traits = targetActor?.system?.traits;
    if (!traits || !damageType) return { finalDamage: hullDamage, immune: false, note: null };

    if ((traits.di ?? []).includes(damageType)) {
      return { finalDamage: 0, immune: true, note: "Immune" };
    }

    const weaknessEntry   = (traits.dv ?? []).find(w => w.type === damageType);
    const resistanceEntry = (traits.dr ?? []).find(r => r.type === damageType);

    // Weakness and resistance to the same type cancel each other out (PF2e rule)
    if (weaknessEntry && resistanceEntry) {
      return { finalDamage: hullDamage, immune: false, note: null };
    }

    if (weaknessEntry) {
      const wv = weaknessEntry.value ?? 0;
      return { finalDamage: hullDamage + wv, immune: false, note: `Weak +${wv}` };
    }

    if (resistanceEntry) {
      const rv = resistanceEntry.value ?? 0;
      return { finalDamage: Math.max(0, hullDamage - rv), immune: false, note: `Resistant \u2212${rv}` };
    }

    return { finalDamage: hullDamage, immune: false, note: null };
  }

  /** SF2e radar colour palette: blue to match PF2e's UI style. */
  radarPalette() {
    return {
      ring:           "rgba(68, 170, 255, 0.22)",
      ringLabel:      "rgba(68, 170, 255, 0.55)",
      ghRing:         "rgba(68, 170, 255, 0.28)",
      crosshair:      "rgba(68, 170, 255, 0.10)",
      heading:        "rgba(68, 170, 255, 0.35)",
      friendly:       "#44aaff",
      friendlyOrd:    "#44aaff",
      sweepHighlight: "#44aaff",
      sweep:          "rgba(68, 170, 255, 0.35)",
      sweepTrail:     "rgba(68, 170, 255, 0.08)",
      sweepGlow:      "rgba(68, 170, 255, 0.6)",
      trailStop1:     "rgba(68, 170, 255, 0.03)",
      trailStop2:     "rgba(68, 170, 255, 0.08)",
      trailStop3:     "rgba(68, 170, 255, 0.18)",
      outerRim:       "rgba(68, 170, 255, 0.35)",
    };
  }
}
