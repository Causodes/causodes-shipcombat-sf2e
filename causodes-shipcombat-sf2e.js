/**
 * causodes-shipcombat-sf2e — Starfinder 2e integration layer.
 *
 * ─── Architecture ─────────────────────────────────────────────────────────
 *
 * SF2e channels EVERY actor construction through `ActorProxyPF2e` — a JS
 * Proxy whose `construct` trap looks up `CONFIG.PF2E.Actor.documentClasses[type]`
 * and throws for any unknown type.  Multiple code paths call that proxy via
 * closure-captured references (notably `migrateActorSource()` during document
 * creation), so our type MUST be registered in that map.
 *
 * The collection class (`ActorsPF2e`) also enforces
 * `document instanceof CONFIG.Actor.documentClass`, which resolves to
 * `instanceof ActorPF2e`.  Our actor class must therefore extend `ActorPF2e`
 * (or any subclass of it).  We extend `VehiclePF2e` because it is the
 * nearest concrete class and is already in `documentClasses`.
 *
 * Two PF2e methods need overrides because they assume the PF2e vehicle schema:
 *
 *   prepareBaseData  — ActorPF2e unconditionally writes to
 *     `system.attributes.flanking` and reads `system.details.level.value`.
 *     We stub both before calling super so our thin `ShipModel` doesn't crash.
 *
 *   prepareDerivedData — VehiclePF2e builds HitPointsStatistic, ArmorStatistic,
 *     fortitude saves, etc., all from vehicle schema fields we don't have.
 *     We skip the VehiclePF2e chain entirely; only `system.prepareDerivedData()`
 *     (ShipModel's own) is called.
 *
 * The ship sheet is opened via `ShipActor._getSheetClass()`, which returns
 * `ShipSheet` directly, bypassing `CONFIG.Actor.sheetClasses` lookup and every
 * timing / queuing variable (init → setup → #pending → initializeSheets → ready).
 * `registerSheet` is still called (in `init` via `#pending`) so the sheet-config
 * dropdown in the header reflects our sheet.
 */

import { Sf2eAdapter }        from "./scripts/systems/sf2e-adapter.js";
import { ShipModel }          from "./scripts/actors/ship/ShipModel.js";
import {
  TargetingPopupV1,
  RamTargetPopupV1,
  BattleClarityPopupV1,
  StrikeCraftAttackPopupV1,
  RecoverCraftPopupV1,
} from "./scripts/apps/popups-v1.js";
import { ShipSheet }          from "./scripts/actors/ship/ShipSheet.js";
import { ShipComponentModel } from "./scripts/items/ShipComponentModel.js";
import { ShipComponentSheetSF2e } from "./scripts/items/ShipComponentSheetSF2e.js";
import { NpcShipModel }       from "./scripts/actors/npc/NpcShipModel.js";
import { NpcShipSheet }       from "./scripts/actors/npc/NpcShipSheet.js";
import { ShipOrdnanceModel }  from "./scripts/actors/ordnance/ShipOrdnanceModel.js";
import { OrdnanceSheet }      from "./scripts/actors/ordnance/OrdnanceSheet.js";
ShipCombat.configure({
  moduleId: "causodes-shipcombat-sf2e",
  adapter:  new Sf2eAdapter(),
});

// Override the core ship-header partial with our SF2e-specific version
// (char-header with rarity/size selectors). Must be called before core's
// "setup" hook finalises partials.
ShipCombat.registerPartialOverride(
  "ship-header",
  "modules/causodes-shipcombat-sf2e/templates/actor/partials/ship-header.hbs"
);

// Override the core pilot-helm-sl-alloc partial with the SF2e skill-block version.
ShipCombat.registerPartialOverride(
  "pilot-helm-sl-alloc",
  "modules/causodes-shipcombat-sf2e/templates/actor/partials/pilot-helm-sl-alloc.hbs"
);
// Override SL roll button partials for other roles with SF2e skill-block style.
ShipCombat.registerPartialOverride(
  "captain-leadership",
  "modules/causodes-shipcombat-sf2e/templates/actor/partials/captain-leadership.hbs"
);
ShipCombat.registerPartialOverride(
  "combined-leadership",
  "modules/causodes-shipcombat-sf2e/templates/actor/partials/combined-leadership.hbs"
);
ShipCombat.registerPartialOverride(
  "gunner-ordnance-allocation",
  "modules/causodes-shipcombat-sf2e/templates/actor/partials/gunner-ordnance-allocation.hbs"
);
ShipCombat.registerPartialOverride(
  "ordnance-requisition",
  "modules/causodes-shipcombat-sf2e/templates/actor/partials/ordnance-requisition.hbs"
);
ShipCombat.registerPartialOverride(
  "captain-voidshields",
  "modules/causodes-shipcombat-sf2e/templates/actor/partials/captain-voidshields.hbs"
);
ShipCombat.registerPartialOverride(
  "pilot-helm-control",
  "modules/causodes-shipcombat-sf2e/templates/actor/partials/pilot-helm-control.hbs"
);
ShipCombat.registerPartialOverride(
  "combined-core-actions",
  "modules/causodes-shipcombat-sf2e/templates/actor/partials/combined-core-actions.hbs"
);
ShipCombat.registerPartialOverride(
  "captain-status-bar",
  "modules/causodes-shipcombat-sf2e/templates/actor/partials/captain-status-bar.hbs"
);
ShipCombat.registerPartialOverride(
  "command-deck-bar",
  "modules/causodes-shipcombat-sf2e/templates/actor/partials/command-deck-bar.hbs"
);
// Override npc-ship-header partial with SF2e version that replaces the
// Warhammer {{config "npcRoles"}} helper with a plain text input.
ShipCombat.registerPartialOverride(
  "npc-ship-header",
  "modules/causodes-shipcombat-sf2e/templates/actor/partials/npc-ship-header.hbs"
);
// Override vessel-weapon-traits with SF2e version that uses "Hardness Pen." instead of "AP".
ShipCombat.registerPartialOverride(
  "vessel-weapon-traits",
  "modules/causodes-shipcombat-sf2e/templates/actor/partials/vessel-weapon-traits.hbs"
);



const MODULE_ID       = "causodes-shipcombat-sf2e";
const SHIP_TYPE       = `${MODULE_ID}.ship`;
const NPC_SHIP_TYPE   = `${MODULE_ID}.npcShip`;
const ORDNANCE_TYPE   = `${MODULE_ID}.shipOrdnance`;
const COMPONENT_TYPE  = `${MODULE_ID}.component`;
const SHIP_ICON = "icons/svg/mystery-man.svg";

// ── init hook ────────────────────────────────────────────────────────────────
Hooks.once("init", () => {
  // ── 1. Register the data models and type labels ─────────────────────────
  CONFIG.Actor.dataModels[SHIP_TYPE]      = ShipModel;
  CONFIG.Actor.typeLabels[SHIP_TYPE]      = `TYPES.Actor.${SHIP_TYPE}`;
  CONFIG.Actor.dataModels[NPC_SHIP_TYPE]  = NpcShipModel;
  CONFIG.Actor.typeLabels[NPC_SHIP_TYPE]  = `TYPES.Actor.${NPC_SHIP_TYPE}`;
  CONFIG.Actor.dataModels[ORDNANCE_TYPE]  = ShipOrdnanceModel;
  CONFIG.Actor.typeLabels[ORDNANCE_TYPE]  = `TYPES.Actor.${ORDNANCE_TYPE}`;
  CONFIG.Item.dataModels[COMPONENT_TYPE]  = ShipComponentModel;
  CONFIG.Item.typeLabels[COMPONENT_TYPE]  = `TYPES.Item.${COMPONENT_TYPE}`;

  // ── 2. ShipActor: extends VehiclePF2e so the SF2e proxy and collection ──
  //        both accept it, but overrides the two methods that assume the PF2e
  //        vehicle schema.
  if (!CONFIG.PF2E?.Actor?.documentClasses) {
    console.error(`${MODULE_ID} | CONFIG.PF2E.Actor.documentClasses not present — is the sf2e system active?`);
    return;
  }

  const VehiclePF2e = CONFIG.PF2E.Actor.documentClasses.vehicle;

  class ShipActor extends VehiclePF2e {
    /**
     * Override ActorPF2e.getDefaultArtwork(), which builds the path
     * `systems/sf2e/icons/default-icons/${type}.svg` — a path that 404s on
     * our compound type id.  Use the existing vehicle icon instead.
     */
    static getDefaultArtwork(_actorData) {
      return { img: SHIP_ICON, texture: { src: SHIP_ICON } };
    }

    /**
     * Bypass CONFIG.Actor.sheetClasses lookup entirely.
     *
     * Foundry's default `_getSheetClass` reads `CONFIG.Actor.sheetClasses[type]`,
     * which is populated by `DocumentSheetConfig.#registerSheet`.  Registrations
     * made before `game.ready` go through a `#pending` queue that is only
     * processed during `initializeSheets()`; registrations in `ready` fire
     * immediately but after any earlier `ready` handler that might have already
     * accessed `this.sheet` and cached the result.
     *
     * Overriding here removes ALL timing and queuing variables: every call to
     * `actor.sheet` on a ShipActor always resolves to `ShipSheet`, regardless of
     * when `_getSheetClass` is invoked relative to hook order.
     */
    _getSheetClass() {
      return ShipSheet;
    }

    get allowedItemTypes() {
      return [...super.allowedItemTypes, COMPONENT_TYPE];
    }

    prepareBaseData() {
      // ActorPF2e.prepareBaseData() unconditionally writes to
      // system.attributes.flanking and reads system.details.level.value.
      // Stub them so our thin ShipModel doesn't crash.
      this.system.attributes       ??= {};
      this.system.details          ??= {};
      this.system.details.level    ??= { value: 0 };
      super.prepareBaseData();
    }

    prepareDerivedData() {
      // VehiclePF2e.prepareDerivedData() builds HitPointsStatistic,
      // ArmorStatistic, and saves from PF2e vehicle schema fields that don't
      // exist on ShipModel.  Skip the super chain; call only ShipModel's own
      // prepareDerivedData.
      this.system.prepareDerivedData?.();
    }
  }

  CONFIG.PF2E.Actor.documentClasses[SHIP_TYPE] = ShipActor;

  // ── 4a. Register NPC ship + ordnance actor types in SF2e's proxy ─────────
  // Both are combat actors that own component items only.  They extend
  // VehiclePF2e for the same reason as ShipActor (proxy + collection compat).
  class NpcShipActor extends VehiclePF2e {
    static getDefaultArtwork(_d) { return { img: SHIP_ICON, texture: { src: SHIP_ICON } }; }
    _getSheetClass() { return NpcShipSheet; }
    get allowedItemTypes() { return [...super.allowedItemTypes, COMPONENT_TYPE]; }
    prepareBaseData() {
      this.system.attributes    ??= {};
      this.system.details       ??= {};
      this.system.details.level ??= { value: 0 };
      super.prepareBaseData();
    }
    prepareDerivedData() { this.system.prepareDerivedData?.(); }
  }
  class ShipOrdnanceActor extends VehiclePF2e {
    static getDefaultArtwork(_d) { return { img: SHIP_ICON, texture: { src: SHIP_ICON } }; }
    _getSheetClass() { return OrdnanceSheet; }
    prepareBaseData() {
      this.system.attributes    ??= {};
      this.system.details       ??= {};
      this.system.details.level ??= { value: 0 };
      super.prepareBaseData();
    }
    prepareDerivedData() { this.system.prepareDerivedData?.(); }
  }
  CONFIG.PF2E.Actor.documentClasses[NPC_SHIP_TYPE] = NpcShipActor;
  CONFIG.PF2E.Actor.documentClasses[ORDNANCE_TYPE]  = ShipOrdnanceActor;

  // ── 4b. Register component item type in SF2e's item proxy ─────────────────
  // ItemProxyPF2e throws for any type not in CONFIG.PF2E.Item.documentClasses.
  //
  // We must NOT extend CONFIG.Item.documentClass (= ItemProxyPF2e) — that
  // causes infinite recursion.  We must also NOT extend a schema-specific
  // subclass like AbilityItemPF2e (the "action" type) — that class expects
  // system.description, system.rules, etc. in prepareBaseData/_preCreate,
  // which our ShipComponentModel does not provide.
  //
  // Fix: climb one level up the prototype chain from any concrete class to
  // reach ItemPF2e (the base, which only requires the common item schema fields
  // that ShipComponentModel inherits through ShipComponentSchemaMixin), then
  // override the schema-dependent lifecycle hooks to skip parent logic.
  const anyConcreteItem =
    CONFIG.PF2E.Item.documentClasses.action ??
    CONFIG.PF2E.Item.documentClasses.lore   ??
    Object.values(CONFIG.PF2E.Item.documentClasses).find(Boolean);

  if (!anyConcreteItem) {
    console.error(`${MODULE_ID} | Could not find a concrete PF2e item class — component items will not work.`);
  } else {
    // Object.getPrototypeOf(AbilityItemPF2e) === ItemPF2e
    const ItemPF2eBase = Object.getPrototypeOf(anyConcreteItem);

    const COMPONENT_ICON = "icons/svg/chest.svg";
    class ShipComponentItem extends ItemPF2eBase {
      _ensureSf2eGrantFlags() {
        const systemId = game.system.id;
        const current = this._source.flags?.[systemId];
        const hasShape = current
          && typeof current === "object"
          && Object.hasOwn(current, "grantedBy")
          && Object.hasOwn(current, "itemGrants");
        if (hasShape) return;

        const normalized = foundry.utils.mergeObject(
          { grantedBy: null, itemGrants: {} },
          current && typeof current === "object" ? current : {},
          { inplace: false }
        );
        this.updateSource({ [`flags.${systemId}`]: normalized });
      }

      static getDefaultArtwork(_itemData) {
        return { img: COMPONENT_ICON };
      }
      prepareBaseData() {
        this._ensureSf2eGrantFlags();
        // ItemPF2e.prepareBaseData() reads common schema fields like
        // system.description.  Skip the chain; only call our model.
        this.system.prepareBaseData?.();
      }
      prepareDerivedData() {
        this.system.prepareDerivedData?.();
      }
      prepareRuleElements() {
        // system.rules is not defined on ShipComponentModel — skip the SF2e
        // RuleElements chain entirely to avoid TypeError on .entries().
        return (this.rules = []);
      }
      async _preCreate(data, options, user) {
        // ALL PF2e _preCreate overrides (ItemPF2e and subclasses) assume schema
        // fields like system.rules, system.description etc.  Skip the entire
        // SF2e chain; return undefined (not false) to allow creation to proceed.
        this._ensureSf2eGrantFlags();
      }
      async delete(options = {}) {
        // SF2e's processGrantDeletions assumes both grantedBy and itemGrants
        // exist under flags.sf2e. Ensure that shape before deletion starts.
        this._ensureSf2eGrantFlags();
        return super.delete(options);
      }
    }

    if (CONFIG.PF2E?.Item?.documentClasses) {
      CONFIG.PF2E.Item.documentClasses[COMPONENT_TYPE] = ShipComponentItem;
    }
  }

  // ── 3. Patch createDialog so our types appear in the create-actor picker ──
  // SF2e's ActorPF2e.createDialog does:
  //   options.types = unique([options.types ?? ACTOR_TYPES].flat())
  // If options.types is falsy it falls back to SF2e's own ACTOR_TYPES, which
  // doesn't include our module types.  We pre-populate it with every key in
  // CONFIG.PF2E.Actor.documentClasses — that map includes both SF2e's native
  // types AND ours (registered above in this init hook), so it's always correct
  // regardless of whether game.documentTypes has picked up module.json changes.
  const OUR_ACTOR_TYPES = [SHIP_TYPE, NPC_SHIP_TYPE, ORDNANCE_TYPE];
  const Sf2eActorProxy = CONFIG.Actor.documentClass;
  const _origCreateDialog = Sf2eActorProxy.createDialog;
  Sf2eActorProxy.createDialog = function (data, createOptions, options = {}) {
    if (!options.types) {
      options.types = Object.keys(CONFIG.PF2E.Actor.documentClasses);
    } else {
      for (const t of OUR_ACTOR_TYPES) {
        if (!options.types.includes(t)) options.types.push(t);
      }
    }
    return _origCreateDialog.call(this, data, createOptions, options);
  };

  // ── 3b. Patch Item.createDialog for the same reason ──────────────────────
  // SF2e's ItemPF2e.createDialog does the same ITEM_TYPES fallback.
  // We use CONFIG.PF2E.Item.documentClasses as the authoritative type list.
  const ItemDocClass = CONFIG.Item.documentClass;
  const _origItemCreateDialog = ItemDocClass.createDialog;
  ItemDocClass.createDialog = async function (data, createOptions, options = {}) {
    if (!options.types) {
      options.types = Object.keys(CONFIG.PF2E?.Item?.documentClasses ?? {});
    } else if (!options.types.includes(COMPONENT_TYPE)) {
      options.types.push(COMPONENT_TYPE);
    }
    return _origItemCreateDialog.call(this, data, createOptions, options);
  };
  // ── 5. Register the sheets ──────────────────────────────────────────────
  foundry.documents.collections.Actors.registerSheet(MODULE_ID, ShipSheet, {
    types:       [SHIP_TYPE],
    makeDefault: true,
    label:       "SHIPCOMBAT.Sheet.Ship",
  });
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, MODULE_ID, NpcShipSheet, {
    types:       [NPC_SHIP_TYPE],
    makeDefault: true,
    label:       "SHIPCOMBAT.Sheet.NpcShip",
  });
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, MODULE_ID, OrdnanceSheet, {
    types:       [ORDNANCE_TYPE],
    makeDefault: true,
    label:       "SHIPCOMBAT.Sheet.Ordnance",
  });

  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, MODULE_ID, ShipComponentSheetSF2e, {
    types:       [COMPONENT_TYPE],
    makeDefault: true,
    label:       "SHIPCOMBAT.Sheet.Component",
  });

  // ── 6. Register SF2e AppV1 popup overrides ──────────────────────────────
  // The Core _popupClass() fallback uses _POPUP_V1_DEFAULTS (Core's own V1
  // classes).  Override with the SF2e variants that implement d20-specific
  // accuracy display, hit-bonus scaling, and tooltip formatting.
  ShipCombat.registerPopupOverride("targeting",         TargetingPopupV1);
  ShipCombat.registerPopupOverride("ramTarget",         RamTargetPopupV1);
  ShipCombat.registerPopupOverride("battleClarity",     BattleClarityPopupV1);
  ShipCombat.registerPopupOverride("strikeCraftAttack", StrikeCraftAttackPopupV1);
  ShipCombat.registerPopupOverride("recoverCraft",      RecoverCraftPopupV1);

  // ── 7. Patch EncounterPF2e.rollInitiative for ship actors ─────────────────
  // PF2e's EncounterPF2e.rollInitiative filters combatants to those with an
  // actor.initiative property (fightyCombatants). ShipActor skips
  // prepareDerivedData() and never sets actor.initiative, so the ship combatant
  // is silently dropped and its initiative is never set from the tracker.
  //
  // This patch intercepts ship-actor combatants before PF2e processes the id
  // list, performs the captain-based initiative roll via Sf2eAdapter, and sets
  // the combatant's initiative directly. Non-ship combatants are delegated to
  // PF2e's own implementation as normal.
  const _sf2eAdapter = new Sf2eAdapter();

  // Register the renderChatMessageHTML hook that dynamically rebuilds the SC
  // Points table in any chat message that contains one — ensuring the
  // active row and "Points Granted" text are always correct, even after
  // a PF2e reroll creates a new message carrying the old flavor HTML.
  _sf2eAdapter.registerRenderHook();

  const EncounterPF2e = CONFIG.Combat.documentClass;
  const _origEncounterRollInitiative = EncounterPF2e.prototype.rollInitiative;
  EncounterPF2e.prototype.rollInitiative = async function (ids, options) {
    const combatantIds = Array.isArray(ids) ? ids : [ids];
    const shipIds     = [];
    const npcShipIds  = [];
    const otherIds    = [];
    for (const id of combatantIds) {
      const actor = this.combatants.get(id)?.actor;
      if (actor?.type === SHIP_TYPE)     shipIds.push(id);
      else if (actor?.type === NPC_SHIP_TYPE) npcShipIds.push(id);
      else otherIds.push(id);
    }

    for (const id of shipIds) {
      const combatant = this.combatants.get(id);
      const ship      = combatant?.actor;
      if (!ship) continue;

      // Resolve the captain crew actor (mirrors _onRollInitiative in captain.js)
      const sys = ship.system;
      let crewActor = null;
      const captainRef = sys.crewActors?.captain;
      if (captainRef?.uuid) {
        try { crewActor = await fromUuid(captainRef.uuid); } catch { /* ignore */ }
      }
      if (!crewActor) {
        const entry = Object.entries(sys.roles ?? {}).find(([, r]) => r === "captain");
        if (entry) crewActor = game.users.get(entry[0])?.character ?? null;
      }
      if (!crewActor) {
        ui.notifications.warn(game.i18n.localize("SHIPCOMBAT.Warning.NoCaptainAssigned"));
        continue;
      }

      const roleSkill = sys.roleSkillOverrides?.captain ?? "leadership";
      const { total } = await _sf2eAdapter.rollShipInitiative(crewActor, roleSkill, {
        flavor:  game.i18n.localize("SHIPCOMBAT.Captain.RollInitiativeBtn"),
        speaker: ChatMessage.getSpeaker({ actor: crewActor }),
      });
      await this.setInitiative(id, _sf2eAdapter.toCombatantInitiative(total, ship));
    }

    // NPC ships: roll d20 + PIL modifier (same mechanic as player ships,
    // but driven by the ship's own piloting attribute instead of a crew actor).
    for (const id of npcShipIds) {
      const combatant = this.combatants.get(id);
      const ship = combatant?.actor;
      if (!ship) continue;
      const piloting = ship.system?.attributes?.piloting ?? 0;
      const { total } = await _sf2eAdapter.rollShipInitiativeFromAttribute(
        piloting,
        game.i18n.localize("SHIPCOMBAT.NpcShip.RollInitiative"),
        { speaker: ChatMessage.getSpeaker({ actor: ship }) },
      );
      await this.setInitiative(id, _sf2eAdapter.toCombatantInitiative(total, ship));
    }

    if (otherIds.length > 0) {
      return _origEncounterRollInitiative.call(this, otherIds, options);
    }
    return this;
  };

});

// ── Default token size for ordnance (SF2e) ───────────────────────────────────
// Torpedoes and strike craft are sub-grid tokens (0.5 × 0.5 squares).
// This sets the prototype default at creation time; GMs can override afterwards.
Hooks.on("preCreateActor", (actor, data, _options, _userId) => {
  // SF2e pre-populates img with "systems/sf2e/icons/default-icons/<type>.svg"
  // before _preCreate fires, so getDefaultArtwork() never wins.  Intercept
  // here and replace any broken/default path with SHIP_ICON.
  const OUR_TYPES = [SHIP_TYPE, NPC_SHIP_TYPE, ORDNANCE_TYPE];
  if (OUR_TYPES.includes(actor.type)) {
    const sf2eDefault = `systems/${game.system.id}/icons/default-icons/${actor.type}.svg`;
    if (!data.img || data.img === CONST.DEFAULT_TOKEN || data.img === sf2eDefault) {
      actor.updateSource({ img: SHIP_ICON, "prototypeToken.texture.src": SHIP_ICON });
    }
  }
  if (actor.type === ORDNANCE_TYPE) {
    actor.updateSource({
      "prototypeToken.width":  0.5,
      "prototypeToken.height": 0.5,
    });
  }
  // SF2e/PF2e uses d20 modifiers — initialize NPC crew attributes to 0 (not core's d100 default of 40).
  if (actor.type === NPC_SHIP_TYPE) {
    actor.updateSource({
      "system.attributes.piloting": 0,
      "system.attributes.tech":     0,
      "system.attributes.gunnery":  0,
    });
  }
});

// ── Default icon for component items ────────────────────────────────────────
// SF2e's _preCreate chain is skipped on ShipComponentItem, so getDefaultArtwork
// never fires. Use a preCreateItem hook to set the icon at creation time.
// The SF2e system also assigns a type-derived default path
// ("systems/sf2e/icons/default-icons/<type>.svg") before this hook fires, so
// we must also intercept that path.
const _COMPONENT_ICON = "icons/svg/chest.svg";
Hooks.on("preCreateItem", (item, data, _options, _userId) => {
  if (item.type === COMPONENT_TYPE) {
    const systemDefault = `systems/${game.system.id}/icons/default-icons/${COMPONENT_TYPE}.svg`;
    if (!data.img || data.img === CONST.DEFAULT_TOKEN || data.img === systemDefault) {
      item.updateSource({ img: _COMPONENT_ICON });
    }
  }
});


// ── setup hook ───────────────────────────────────────────────────────────────
// Load SF2e-specific templates that are referenced by full path from the sheet.
// The overview tab template is not in core's overridable-partial registry; it
// is instead injected via partTemplates["overview"] override in ShipSheet.getData().
Hooks.once("setup", async () => {
  // ── Sidebar logo ──────────────────────────────────────────────────────────
  // Use the Starfinder logo on sf2e, Pathfinder logo on pf2e.
  const logoPath = game.system.id === "sf2e"
    ? "systems/sf2e/assets/starfinder_logo.webp"
    : "systems/pf2e/assets/pathfinder_logo.webp";
  const logoStyle = document.createElement("style");
  logoStyle.id = "causodes-shipcombat-logo-override";
  logoStyle.textContent =
    `.sf2e-ship-logo { background: url("/${logoPath}") no-repeat center / contain; }`;
  document.head.appendChild(logoStyle);

  // The ship-sheet-sf2e.hbs templates reference system partials by their sf2e
  // paths. On pf2e those files exist at the same relative paths under
  // systems/pf2e/. If the sf2e-aliased partials aren't already registered
  // (sf2e registers them itself during init), load them from the active system
  // and register them under the sf2e path aliases our templates use.
  const SYSTEM_PARTIAL_ALIASES = [
    "systems/sf2e/templates/actors/partials/modifiers-tooltip.hbs",
    "systems/sf2e/templates/actors/character/icons/d20.hbs",
  ];
  for (const alias of SYSTEM_PARTIAL_ALIASES) {
    if (!Handlebars.partials[alias]) {
      const activePath = alias.replace("systems/sf2e/", `systems/${game.system.id}/`);
      // eslint-disable-next-line no-await-in-loop
      const fn = await foundry.applications.handlebars.getTemplate(activePath);
      Handlebars.registerPartial(alias, fn);
    }
  }

  await foundry.applications.handlebars.loadTemplates([
    // Overview tab override
    "modules/causodes-shipcombat-sf2e/templates/actor/tabs/ship-overview-sf2e.hbs",
    // Role tab subtab overrides — 6-player
    "modules/causodes-shipcombat-sf2e/templates/actor/tabs/engineer-sf2e.hbs",
    "modules/causodes-shipcombat-sf2e/templates/actor/tabs/captain-sf2e.hbs",
    "modules/causodes-shipcombat-sf2e/templates/actor/tabs/pilot-sf2e.hbs",
    "modules/causodes-shipcombat-sf2e/templates/actor/tabs/gunner-sf2e.hbs",
    "modules/causodes-shipcombat-sf2e/templates/actor/tabs/sensors-sf2e.hbs",
    "modules/causodes-shipcombat-sf2e/templates/actor/tabs/ordnance-sf2e.hbs",
    // Role tab subtab overrides — 5-player
    "modules/causodes-shipcombat-sf2e/templates/actor/tabs/engineer-5man-sf2e.hbs",
    "modules/causodes-shipcombat-sf2e/templates/actor/tabs/gunner-5man-sf2e.hbs",
    "modules/causodes-shipcombat-sf2e/templates/actor/tabs/captain-5man-sf2e.hbs",
    // Role tab subtab overrides — 4-player
    "modules/causodes-shipcombat-sf2e/templates/actor/tabs/captain-4man-sf2e.hbs",
    "modules/causodes-shipcombat-sf2e/templates/actor/tabs/gunner-4man-sf2e.hbs",
    // Role tab subtab overrides — 3-player
    "modules/causodes-shipcombat-sf2e/templates/actor/tabs/engineer-3man-sf2e.hbs",
    // Partial overrides
    "modules/causodes-shipcombat-sf2e/templates/actor/partials/combined-core-actions.hbs",
    "modules/causodes-shipcombat-sf2e/templates/actor/partials/npc-ship-header.hbs",
    "modules/causodes-shipcombat-sf2e/templates/actor/partials/captain-status-bar.hbs",
    // NPC ship and ordnance sheet wrapper templates (player-ship paradigm)
    "modules/causodes-shipcombat-sf2e/templates/actor/npc-ship-sheet-sf2e.hbs",
    "modules/causodes-shipcombat-sf2e/templates/actor/tabs/npc-movement-sf2e.hbs",
    "modules/causodes-shipcombat-sf2e/templates/actor/tabs/npc-gunner-sf2e.hbs",
    "modules/causodes-shipcombat-sf2e/templates/actor/ordnance-sheet-sf2e.hbs",
    // Component item sheet partials
    "modules/causodes-shipcombat-sf2e/templates/items/ship-component.hbs",
    "modules/causodes-shipcombat-sf2e/templates/items/component-sidebar.hbs",
    "modules/causodes-shipcombat-sf2e/templates/items/component-item-details.hbs",
  ]);

  // ── NPC ship-body column header patch + flux-max injection ──────────────
  // Core's npc-ship-body.hbs hardcodes "TEC" and "GUN" as column abbreviations.
  // For SF2e/PF2e we rebrand these as ENG (Engineering) and RNG (Ranged).
  // We also surface the max-flux input directly under the Zone Max list so GMs
  // don't have to find it in the hidden hint panel.
  // Fetch the raw template text, patch it, recompile, and re-register the
  // partial under the same full-path key core uses.
  try {
    const NPC_BODY_KEY = "modules/causodes-shipcombat-core/templates/actor/tabs/npc/npc-ship-body.hbs";
    const resp = await fetch(`/${NPC_BODY_KEY}`);
    if (resp.ok) {
      const patched = (await resp.text())
        // Column abbreviation renames
        .replace(/>TEC<\/td>/, ">ENG</td>")
        .replace(/>GUN<\/td>/, ">RNG</td>")
        // Inject Flux Max row at the bottom of the Zone Max sector list,
        // right before the list's closing </div> (after {{/each}}).
        // Inject Flux Max row below the sector list.
        // The injected input uses data-system-field (not name=) to avoid
        // duplicating system.voidshieldFlux in form data alongside the
        // existing hint-panel input, which would produce an array → NaN.
        .replace(
          'shipcombat-npc-shield-max-input">\n              </div>\n              {{/each}}\n            </div>',
          'shipcombat-npc-shield-max-input">\n              </div>\n              {{/each}}\n              <hr class="shipcombat-hint-divider">\n              <div class="shipcombat-ssl-head">{{localize "SHIPCOMBAT.NpcShip.VoidshieldFlux"}}</div>\n              <div class="shipcombat-ssl-row">\n                <span class="shipcombat-ssl-label">{{localize "SHIPCOMBAT.NpcShip.FluxMax"}}</span>\n                <input type="number" data-system-field="voidshieldFlux" value="{{sys.voidshieldFlux}}" min="0" class="shipcombat-ssl-max shipcombat-npc-shield-max-input">\n              </div>\n            </div>',
        );
      Handlebars.registerPartial(NPC_BODY_KEY, Handlebars.compile(patched));
    }
  } catch { /* non-fatal — falls back to core's TEC/GUN labels */ }
});

// ── SF2e: Seed ship prevTurnMove at combat start so first-round drift works ─
// In SF2e, ships are always in motion when entering combat. If prevTurnMove is
// 0 (fresh actor / never moved), initialize it to the ship's movement.speed so
// the auto-drift mechanic activates from the very first turn without requiring
// a manual Full Reset via the GM HUD.
Hooks.on("combatStart", async (combat) => {
  if (!game.user.isGM) return;
  const ShipCombatState = window.ImpMalShipCombat?.ShipCombatState;
  if (!ShipCombatState) return;
  const ship = ShipCombatState.ship;
  if (!ship) return;
  const prevTurnMove = ship.system.resources?.pilot?.prevTurnMove ?? 0;
  if (prevTurnMove === 0) {
    const speed = ship.system.movement?.speed ?? 0;
    if (speed > 0) {
      await ShipCombatState.update({ "resources.pilot.prevTurnMove": speed });
    }
  }
});
