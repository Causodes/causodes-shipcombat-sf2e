/**
 * ShipComponentSheetSF2e — AppV1 item sheet for ship component items in SF2e.
 *
 * Extends ShipComponentSheetV1Mixin (Core) which provides all system-agnostic
 * context data and tab/listener plumbing.  This class adds SF2e-specific
 * chrome: the PF2e sidebar layout, rarity/bulk/size choices, and the SF2e-
 * styled WeaponTraitsEditor dialog.
 */

const { ShipComponentSheetV1Mixin } = globalThis.ShipCombat._api;

const MODULE_ID      = "causodes-shipcombat-sf2e";
const CORE_MODULE_ID = "causodes-shipcombat-core";

// ─────────────────────────────────────────────────────────────────────────────
// WeaponTraitsEditor — SF2e-styled AppV1 Application for editing traits.
// Uses PF2e CSS classes so the dialog matches SF2e's native look.
// ─────────────────────────────────────────────────────────────────────────────
const WEAPON_TRAITS = [
  { key: "shieldBypass",       hasValue: false },
  { key: "unlimitedRof",       hasValue: false },
  { key: "shieldBurn",         hasValue: true,  enabledKey: "shieldBurnEnabled" },
  { key: "rend",               hasValue: true,  enabledKey: "rendEnabled" },
  { key: "armourPenetration",  hasValue: true,  enabledKey: "armourPenetrationEnabled" },
  { key: "devastating",        hasValue: true,  enabledKey: "devastatingEnabled" },
  { key: "unreliable",         hasValue: false },
  { key: "overcharge",         hasValue: false },
  { key: "hitRatingModifier",  hasValue: true,  allowNegative: true, enabledKey: "hitRatingModifierEnabled" },
];
const ORDNANCE_TRAITS = [
  { key: "shieldBypass",      hasValue: false },
  { key: "shieldBurn",        hasValue: true, enabledKey: "shieldBurnEnabled" },
  { key: "rend",              hasValue: true, enabledKey: "rendEnabled" },
  { key: "armourPenetration", hasValue: true, enabledKey: "armourPenetrationEnabled" },
];

class WeaponTraitsEditor extends foundry.appv1.api.Application {
  constructor(item, options = {}) {
    super(options);
    this._item = item;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:       "weapon-traits-editor",
      title:    game.i18n.localize("SHIPCOMBAT.Component.Traits"),
      classes:  ["pf2e", "tag-selector", "weapon-traits-editor"],
      width:    360,
      height:   "auto",
      resizable: true,
    });
  }

  _resolveTraitContext() {
    const sys  = this._item.system;
    const slot = sys.slot;
    if (slot === "torpedo") {
      return { traitPath: "system.torpedoTraits", traits: sys.torpedoTraits ?? {}, traitDefs: ORDNANCE_TRAITS };
    } else if (slot === "strikeCraft") {
      return { traitPath: "system.craftTraits",   traits: sys.craftTraits   ?? {}, traitDefs: ORDNANCE_TRAITS };
    }
    return { traitPath: "system.traits", traits: sys.traits ?? {}, traitDefs: WEAPON_TRAITS };
  }

  async getData() {
    const { traits, traitDefs } = this._resolveTraitContext();
    const rows = traitDefs.map(def => {
      const name    = game.i18n.localize(`SHIPCOMBAT.Trait.${def.key.charAt(0).toUpperCase() + def.key.slice(1)}`);
      const enabled = def.hasValue
        ? (def.enabledKey ? (traits[def.enabledKey] === true) : (traits[def.key] > 0))
        : (traits[def.key] === true);
      const val = def.hasValue ? (traits[def.key] ?? 0) : null;
      return { def, name, enabled, val };
    });
    return { rows };
  }

  async _renderInner(data) {
    const rowHtml = data.rows.map(({ def, name, enabled, val }) => {
      const numInput = def.hasValue
        ? `<input type="number" name="${def.key}-value" value="${val ?? 0}"
             ${def.allowNegative ? "" : `min="0"`}
             style="width:3.5rem;text-align:left;margin-right:0.5rem;">`
        : "";
      const checkbox = `<input type="checkbox" name="${def.enabledKey ?? def.key}"
                               ${enabled ? "checked" : ""}
                               id="trait-${def.key}">`;
      return `
        <li class="weapon-trait-row">
          <label class="option" for="trait-${def.key}">
            ${checkbox}
            <span class="trait-name">${name}</span>
          </label>
          ${numInput}
        </li>`;
    }).join("");

    return $(`<form autocomplete="off">
      <ul class="weapon-traits-list">${rowHtml}</ul>
      <footer>
        <button type="button" class="wte-save">
          <i class="fa-regular fa-floppy-disk"></i>
          ${game.i18n.localize("DOCUMENT.Update", { type: game.i18n.localize("DOCUMENT.Item") })}
        </button>
      </footer>
    </form>`);
  }

  activateListeners($html) {
    super.activateListeners($html);
    const html = $html[0];
    html.querySelector(".wte-save")?.addEventListener("click", async () => {
      const { traitPath, traitDefs } = this._resolveTraitContext();
      const updates = {};
      for (const def of traitDefs) {
        const enabledName = def.enabledKey ?? def.key;
        const checkboxEl  = html.querySelector(`input[name="${enabledName}"]`);
        const isEnabled   = checkboxEl?.checked ?? false;

        if (def.hasValue) {
          const numEl = html.querySelector(`input[name="${def.key}-value"]`);
          updates[`${traitPath}.${def.key}`] = isEnabled ? Number(numEl?.value ?? 0) : 0;
          if (def.enabledKey) {
            updates[`${traitPath}.${def.enabledKey}`] = isEnabled;
          }
        } else {
          updates[`${traitPath}.${def.key}`] = isEnabled;
        }
      }
      await this._item.update(updates);
      this.close();
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export class ShipComponentSheetSF2e extends ShipComponentSheetV1Mixin(foundry.appv1.sheets.ItemSheet) {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes:  ["pf2e", "item", "sheet", "causodes-shipcombat-sf2e", "shipcombat-component"],
      template: `modules/${MODULE_ID}/templates/items/ship-component.hbs`,
      width:    750,
      height:   520,
      tabs: [{
        navSelector:     ".sheet-tabs .tabs",
        contentSelector: ".sheet-body",
        initial:         "description",
      }],
    });
  }

  /** Call Core mixin's getData() then layer on SF2e-specific context. */
  async getData(options = {}) {
    const base = await super.getData(options);
    const sys  = this.item.system;

    // SF2e template uses a different enrichment format (flat vs nested)
    const enrichedContent = {
      description: await TextEditor.enrichHTML(sys.notes?.player ?? "", { secrets: this.item.isOwner }),
      gmNotes:     await TextEditor.enrichHTML(sys.notes?.gm    ?? ""),
    };

    return {
      ...base,
      /* SF2e sidebar-layout template paths */
      sidebarTemplate: `modules/${MODULE_ID}/templates/items/component-sidebar.hbs`,
      sidebarTitle:    game.i18n.localize("SHIPCOMBAT.Sheet.ComponentSummary"),
      detailsTemplate: `modules/${MODULE_ID}/templates/items/component-item-details.hbs`,
      /* SF2e header extras */
      itemType: game.i18n.localize("DOCUMENT.Item") || "Item",
      rarities: Object.fromEntries(
        Object.entries(CONFIG.PF2E?.rarityTraits ?? {
          common: "PF2E.TraitCommon", uncommon: "PF2E.TraitUncommon",
          rare:   "PF2E.TraitRare",   unique:   "PF2E.TraitUnique",
        }).map(([k, v]) => [k, game.i18n.localize(v)])
      ),
      /* Description tab enrichment */
      enrichedContent,
      /* Sidebar choices */
      bulkChoices: [
        { value: "neg", label: "—",        selected: sys.bulk === "neg" },
        { value: "L",   label: "L",        selected: sys.bulk === "L" },
        { value: "1",   label: "1",        selected: (sys.bulk ?? "1") === "1" },
        { value: "2",   label: "2",        selected: sys.bulk === "2" },
        { value: "3",   label: "3",        selected: sys.bulk === "3" },
        { value: "4",   label: "4",        selected: sys.bulk === "4" },
        { value: "5",   label: "5",        selected: sys.bulk === "5" },
        { value: "6",   label: "6",        selected: sys.bulk === "6" },
      ],
      sizeChoices: [
        { value: "tiny", label: "Tiny",       selected: sys.size === "tiny" },
        { value: "sm",   label: "Small",      selected: sys.size === "sm" },
        { value: "med",  label: "Medium",     selected: (sys.size ?? "med") === "med" },
        { value: "lg",   label: "Large",      selected: sys.size === "lg" },
        { value: "huge", label: "Huge",       selected: sys.size === "huge" },
        { value: "grg",  label: "Gargantuan", selected: sys.size === "grg" },
      ],
      dieSizeChoices: ["d4", "d6", "d8", "d10", "d12"].map(die => ({
        value: die, label: die, selected: die === (sys.dieSize ?? "d6"),
      })),
    };
  }

  /* ── listeners ─────────────────────────────────────────────────────────── */

  activateListeners($html) {
    super.activateListeners($html);

    // Inject "Add GM Notes" button into the main description editor (mirrors PF2e's ItemSheetPF2e)
    if (game.user.isGM) {
      $html.find(".tab.description .main .editor").each((_i, el) => {
        const btn = document.createElement("a");
        btn.className = "add-gm-notes";
        btn.innerHTML = '<i class="fa-solid fa-plus"></i>';
        btn.title = "Add GM Notes";
        btn.addEventListener("click", () => {
          $html.find(".tab.description .gm-notes").addClass("has-content");
        });
        el.appendChild(btn);
      });
    }
  }

  /** Use SF2e's PF2e-styled WeaponTraitsEditor instead of Core's generic one. */
  _onEditWeaponTraits() {
    new WeaponTraitsEditor(this.item).render(true);
  }
}
