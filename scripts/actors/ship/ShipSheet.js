/**
 * ShipSheet — SF2e concrete ship actor sheet (AppV1).
 *
 * Extends `foundry.appv1.sheets.ActorSheet` directly via the system-agnostic
 * `ShipSheetV1Mixin`.  We deliberately do NOT extend `ActorSheetPF2e`:
 *
 *   - `VehicleSheetPF2e.getData()` reads PF2e vehicle schema (attributes.ac,
 *     saves.fortitude, details.description, traits.rarity) that don't exist
 *     on `ShipModel`, so even `ActorSheetPF2e` brings PF2e-specific behavior
 *     we don't want and don't need for a fully custom ship type.
 *   - The base `foundry.appv1.sheets.ActorSheet` is always available at
 *     module-eval time, eliminating the timing issues that previously forced
 *     a setup-hook factory pattern.
 *
 * Visual styling (CRB-like chrome, theme classes, etc.) is applied through
 * the `classes` array below and CSS in `styles/shared.css`, not through
 * inheritance from a system-specific sheet base.
 */

const { ShipSheetV1Mixin, emitToGM, SystemAdapter } = globalThis.ShipCombat._api;

// ---------------------------------------------------------------------------
// ShipTraitSelector  —  mirrors SF2e TagSelectorBasic for our custom actor type.
//
// Opened when the GM clicks the "+" tag-selector button in the traits row.
// Uses CONFIG.PF2E.vehicleTraits for the available options (same source that
// the SF2e vehicle sheet uses) so the available list stays in sync with the
// system.  Saves the selection back to system.traits.value as an array of
// slugs (matching our ShipModel ArrayField definition).
// ---------------------------------------------------------------------------
class ShipTraitSelector extends foundry.appv1.api.Application {
  constructor(actor, options = {}) {
    super(options);
    this._actor = actor;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "ship-trait-selector",
      title: "Traits",
      classes: ["pf2e", "tag-selector"],
      width: 325,
      height: 480,
      resizable: true,
      scrollY: ["ul"],
    });
  }

  async getData() {
    const vehicleTraits = CONFIG.PF2E?.vehicleTraits ?? {};
    const current = new Set(this._actor.system.traits?.value ?? []);
    const choices = Object.entries(vehicleTraits)
      .map(([slug, labelKey]) => ({
        slug,
        label: game.i18n.localize(labelKey),
        selected: current.has(slug),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return { choices };
  }

  /** Build the form HTML without a separate template file. */
  async _renderInner(data) {
    const items = data.choices.map(c => `
      <li>
        <label class="option">
          <input type="checkbox" name="${c.slug}" ${c.selected ? "checked" : ""} />
          <span>${c.label}</span>
        </label>
      </li>`).join("");
    return $(`<form autocomplete="off" data-flat="true">
      <header class="search">
        <input type="search" aria-label="Filter" />
      </header>
      <ul>${items}</ul>
      <footer>
        <button type="submit">
          <i class="fa-regular fa-floppy-disk"></i>
          ${game.i18n.localize("DOCUMENT.Update", { type: game.i18n.localize("DOCUMENT.Actor") })}
        </button>
      </footer>
    </form>`);
  }

  activateListeners($html) {
    super.activateListeners($html);
    const html = $html[0];
    const actor = this._actor;

    // Live search filter
    html.querySelector("input[type=search]")?.addEventListener("input", e => {
      const q = e.target.value.trim().toLowerCase();
      for (const li of html.querySelectorAll("ul > li")) {
        li.hidden = !!q && !(li.querySelector("span")?.textContent.toLowerCase().includes(q));
      }
    });

    // Submit: persist selected slugs
    html.querySelector("button[type=submit]")?.addEventListener("click", async () => {
      const selected = [...html.querySelectorAll("input[type=checkbox]:checked")].map(cb => cb.name);
      await actor.update({ "system.traits.value": selected });
      this.close();
    });
  }
}

// ---------------------------------------------------------------------------
// ShipIWREditor — inline editor for Immunities, Weaknesses, or Resistances.
//
// mode: "di" (immunities — type slug only), "dv" (weaknesses), "dr" (resistances)
// ---------------------------------------------------------------------------
export class ShipIWREditor extends foundry.appv1.api.Application {
  constructor(actor, mode, options = {}) {
    super(options);
    this._actor = actor;
    this._mode  = mode; // "di" | "dv" | "dr"
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:        "ship-iwr-editor",
      classes:   ["pf2e", "tag-selector"],
      title:     "Edit IWR",
      width:     360,
      height:    480,
      resizable: true,
      scrollY:   ["table"],
    });
  }

  get title() {
    return { di: "Edit Immunities", dv: "Edit Weaknesses", dr: "Edit Resistances" }[this._mode] ?? "Edit IWR";
  }

  _getTypeMap() {
    const damageTypes    = CONFIG.PF2E?.damageTypes    ?? {};
    const conditionTypes = CONFIG.PF2E?.conditionTypes ?? {};
    const immunityTypes  = CONFIG.PF2E?.immunityTypes  ?? {};
    if (this._mode === "di") return { ...damageTypes, ...conditionTypes, ...immunityTypes };
    return damageTypes;
  }

  _localizeKey(key) {
    if (!key) return "";
    if (typeof key === "string" && key.includes(".")) return game.i18n.localize(key);
    return key;
  }

  async _renderInner() {
    const typeMap  = this._getTypeMap();
    const withValues = this._mode !== "di";
    const current  = this._actor.system?.traits?.[this._mode] ?? [];

    // Index current entries: type → value (or true for immunities)
    const currentMap = {};
    if (withValues) {
      for (const entry of current) currentMap[entry.type] = entry.value ?? 5;
    } else {
      for (const slug of current) currentMap[slug] = true;
    }

    const toTitleCase = s => s.charAt(0).toUpperCase() + s.slice(1);
    const sorted = Object.entries(typeMap)
      .filter(([slug]) => !!slug)
      .map(([slug, key]) => ({ slug, label: toTitleCase(this._localizeKey(key) || slug) }))
      .filter(({ label }) => !!label.trim())
      .sort((a, b) => a.label.localeCompare(b.label));

    const rows = sorted.map(({ slug, label }) => {
      const checked = !!currentMap[slug];
      const val     = withValues ? (currentMap[slug] ?? 5) : "";
      return `<tr class="${checked ? "active" : ""}">
        <td><input type="checkbox" name="slug-${slug}" ${checked ? "checked" : ""} /></td>
        <td>${label}</td>
        ${withValues ? `<td><input type="number" class="iwr-value" name="val-${slug}" value="${val}" min="0" step="1" ${!checked ? "disabled" : ""} /></td>` : ""}
      </tr>`;
    }).join("");

    const valHeader = withValues ? "<th>Value</th>" : "";
    return $(`<form autocomplete="off">
      <header class="search">
        <input type="search" aria-label="Filter" placeholder="Filter…" />
      </header>
      <table>
        <thead><tr><th></th><th>Type</th>${valHeader}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <footer>
        <button type="button">
          <i class="fa-regular fa-floppy-disk"></i>
          Save
        </button>
      </footer>
    </form>`);
  }

  activateListeners($html) {
    super.activateListeners($html);
    const html = $html[0];
    const withValues = this._mode !== "di";

    // Live search
    html.querySelector("input[type=search]")?.addEventListener("input", e => {
      const q = e.target.value.trim().toLowerCase();
      for (const tr of html.querySelectorAll("tbody tr")) {
        const label = tr.querySelector("td:nth-child(2)")?.textContent.toLowerCase() ?? "";
        tr.hidden = !!q && !label.includes(q);
      }
    });

    // Enable/disable value input when checkbox toggled
    if (withValues) {
      html.querySelectorAll("input[type=checkbox]").forEach(cb => {
        cb.addEventListener("change", () => {
          const row = cb.closest("tr");
          const numInput = row?.querySelector("input[type=number]");
          if (numInput) numInput.disabled = !cb.checked;
          row?.classList.toggle("active", cb.checked);
        });
      });
    }

    // Save
    html.querySelector("button[type=button]")?.addEventListener("click", async (e) => {
      e.preventDefault();
      const actor = this._actor;
      if (withValues) {
        const entries = [];
        for (const cb of html.querySelectorAll("input[type=checkbox]:checked")) {
          const slug = cb.name.replace("slug-", "");
          const numInput = html.querySelector(`input[name="val-${slug}"]`);
          entries.push({ type: slug, value: parseInt(numInput?.value ?? "5") || 5 });
        }
        await actor.update({ [`system.traits.${this._mode}`]: entries });
      } else {
        const slugs = [...html.querySelectorAll("input[type=checkbox]:checked")].map(cb => cb.name.replace("slug-", ""));
        await actor.update({ [`system.traits.${this._mode}`]: slugs });
      }
      this.close();
    });
  }
}

// ---------------------------------------------------------------------------

const Base = ShipSheetV1Mixin(foundry.appv1.sheets.ActorSheet);

export class ShipSheet extends Base {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: [
        ...(super.defaultOptions.classes ?? []),
        "sf2e", "actor", "sheet", "vehicle", "shipcombat-ship",
      ],
      // Use the SF2e-specific wrapper template rather than the system-agnostic core one
      template: "modules/causodes-shipcombat-sf2e/templates/actor/ship-sheet-sf2e.hbs",
    });
  }

  /**
   * Augment the controller-built context with SF2e enums consumed by the
   * shared HBS template (rarity / size selects).  Reads optional-chained
   * because CONFIG.PF2E is populated by the SF2e system before "init" — but
   * if a future system swap leaves it absent, falling back to {} simply
   * disables those selects rather than throwing.
   */
  async getData(options) {
    const ctx = await super.getData(options);
    ctx.actor         = this.actor;
    ctx.actorRarities = CONFIG.PF2E?.rarityTraits ?? {};
    ctx.actorSizes    = CONFIG.PF2E?.actorSizes   ?? {};
    // Augment each tab with a Font Awesome icon class for the SF2e icon-nav style
    const TAB_ICONS = {
      overview:     "fa-solid fa-star",
      captain:      "fa-solid fa-crown",
      captain4man:  "fa-solid fa-crown",
      captain5man:  "fa-solid fa-crown",
      engineer3man: "fa-solid fa-wrench",
      engineer5man: "fa-solid fa-wrench",
      engineer:     "fa-solid fa-wrench",
      pilot:        "fa-solid fa-steering-wheel",
      sensors:      "fa-solid fa-satellite-dish",
      gunner4man:   "fa-solid fa-crosshairs",
      gunner5man:   "fa-solid fa-crosshairs",
      gunner:       "fa-solid fa-crosshairs",
      ordnance:     "fa-solid fa-bomb",
      config:       "fa-solid fa-gear",
    };
    for (const [id, tab] of Object.entries(ctx.tabs ?? {})) {
      tab.icon = TAB_ICONS[id] ?? "fa-solid fa-circle";
    }
    // Ship classification options (dropdown in the overview identity block)
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
    // Override the overview tab template to our SF2e version which prepends the
    // vehicle-details identity block and vehicle-properties before the core
    // bridge-crew table and installed-components sections.
    const SF2E_BASE = "modules/causodes-shipcombat-sf2e/templates/actor/tabs";
    const SF2E_OVERVIEW = `${SF2E_BASE}/ship-overview-sf2e.hbs`;
    if (ctx.partTemplates) {
      ctx.partTemplates.overview       = SF2E_OVERVIEW;
      // Role tabs — 6-player
      ctx.partTemplates.engineer       = `${SF2E_BASE}/engineer-sf2e.hbs`;
      ctx.partTemplates.captain        = `${SF2E_BASE}/captain-sf2e.hbs`;
      ctx.partTemplates.pilot          = `${SF2E_BASE}/pilot-sf2e.hbs`;
      ctx.partTemplates.gunner         = `${SF2E_BASE}/gunner-sf2e.hbs`;
      ctx.partTemplates.sensors        = `${SF2E_BASE}/sensors-sf2e.hbs`;
      ctx.partTemplates.ordnance       = `${SF2E_BASE}/ordnance-sf2e.hbs`;
      // Role tabs — 5-player
      ctx.partTemplates.engineer5man   = `${SF2E_BASE}/engineer-5man-sf2e.hbs`;
      ctx.partTemplates.gunner5man     = `${SF2E_BASE}/gunner-5man-sf2e.hbs`;
      ctx.partTemplates.captain5man    = `${SF2E_BASE}/captain-5man-sf2e.hbs`;
      // Role tabs — 4-player
      ctx.partTemplates.captain4man    = `${SF2E_BASE}/captain-4man-sf2e.hbs`;
      ctx.partTemplates.gunner4man     = `${SF2E_BASE}/gunner-4man-sf2e.hbs`;
      // Role tabs — 3-player
      ctx.partTemplates.engineer3man   = `${SF2E_BASE}/engineer-3man-sf2e.hbs`;
    }

    // Build traitsList: custom traits with localized labels (for tag display).
    // Looks up each slug in CONFIG.PF2E.vehicleTraits; falls back to the slug
    // with the first letter capitalized if it is not a known vehicle trait.
    const vehicleTraits = CONFIG.PF2E?.vehicleTraits ?? {};
    ctx.traitsList = (ctx.sys?.traits?.value ?? []).map(slug => ({
      value: slug,
      label: vehicleTraits[slug]
        ? game.i18n.localize(vehicleTraits[slug])
        : slug.charAt(0).toUpperCase() + slug.slice(1),
    }));

    // IWR — Immunities / Weaknesses / Resistances (stored as di/dv/dr to match SF2e trait conventions)
    const damageTypes    = CONFIG.PF2E?.damageTypes    ?? {};
    const conditionTypes = CONFIG.PF2E?.conditionTypes ?? {};
    const energyTypes    = CONFIG.PF2E?.energyDamageTypes ?? {};
    const immunityTypes  = CONFIG.PF2E?.immunityTypes  ?? {};
    const allImmunityTypes = { ...damageTypes, ...conditionTypes, ...immunityTypes };

    const localizeType = (types, slug) => {
      const key = types[slug];
      if (!key) return slug.charAt(0).toUpperCase() + slug.slice(1);
      return typeof key === "string" && key.includes(".") ? game.i18n.localize(key) : key;
    };

    ctx.immunities = (ctx.sys?.traits?.di ?? []).map(slug => ({
      slug,
      label: localizeType(allImmunityTypes, slug),
    }));
    ctx.weaknesses = (ctx.sys?.traits?.dv ?? []).map(w => ({
      type: w.type, value: w.value,
      label: localizeType(damageTypes, w.type),
    }));
    ctx.resistances = (ctx.sys?.traits?.dr ?? []).map(r => ({
      type: r.type, value: r.value,
      label: localizeType(damageTypes, r.type),
    }));

    // ── Captain initiative context for sidebar ────────────────────────────────
    const captainRoleIds = ["captain", "captain4man", "captain5man"];
    let captainInitActor = null;
    for (const roleId of captainRoleIds) {
      const role = ctx.roles?.[roleId];
      const actorInfo = role?.assignedActor;
      if (actorInfo?.id) {
        captainInitActor = game.actors?.get(actorInfo.id) ?? null;
      } else if (actorInfo?.uuid) {
        captainInitActor = (typeof fromUuidSync === "function" ? fromUuidSync(actorInfo.uuid) : null) ?? null;
      }
      if (captainInitActor) break;
    }
    const captainSkillOverride = ctx.sys?.roleSkillOverrides?.captain ?? "leadership";
    let captainSkillKey = "diplomacy";
    try {
      captainSkillKey = SystemAdapter.current.resolveSkill(captainSkillOverride).key;
    } catch { /* keep default */ }
    const skillObj = captainInitActor?.skills?.[captainSkillKey];
    const rawMod = skillObj?.totalModifier ?? skillObj?.total ?? 0;
    ctx.captainInitiativeMod = `${rawMod >= 0 ? "+" : ""}${rawMod}`;
    ctx.captainInitiativeSkill = captainSkillKey;
    ctx.captainInitiativeModifiers = skillObj?.check?.modifiers ?? skillObj?.modifiers ?? [];
    const COMPONENT_TYPE = "causodes-shipcombat-sf2e.component";
    // Build modifiers in native SF2e format for modifiers-tooltip.hbs partial.
    const _componentMods = this.actor.items
      .filter(i => i.type === COMPONENT_TYPE
               && (i.system.slot === "armour" || i.system.slot === "engine")
               && i.system.equipped !== false
               && (i.system.armourClassContribution ?? 0) > 0)
      .map(i => ({
        enabled:        true,
        hideIfDisabled: false,
        type:           "item",
        label:          i.name,
        modifier:       i.system.armourClassContribution,
        custom:         false,
        slug:           `component-${i.id}`,
      }));
    const _customMods = (this.actor.getFlag("causodes-shipcombat-sf2e", "acModifiers") ?? []).map((m, idx) => ({
      enabled:        true,
      hideIfDisabled: false,
      type:           m.type ?? "untyped",
      label:          m.label,
      modifier:       m.modifier ?? m.value ?? 0,
      custom:         true,
      slug:           m.slug ?? `custom-${idx}`,
    }));
    ctx.acModifiers = [..._componentMods, ..._customMods];
    const allSkills = CONFIG.PF2E?.skills ?? {};
    const initOptions = Object.entries(allSkills)
      .map(([key, def]) => ({ value: key, label: game.i18n.localize(def.label) }));
    // Perception is not in CONFIG.PF2E.skills but is always available
    initOptions.push({ value: "perception", label: game.i18n.localize("PF2E.PerceptionLabel") });
    // Add the captain actor's lore skills
    for (const loreItem of captainInitActor?.itemTypes?.lore ?? []) {
      const slug = loreItem.slug
        ?? (typeof loreItem.name === "string" ? loreItem.name.slugify?.() : null)
        ?? "";
      if (slug && !initOptions.some(o => o.value === slug)) {
        initOptions.push({ value: slug, label: loreItem.name ?? slug });
      }
    }
    ctx.captainInitiativeOptions = initOptions.sort((a, b) => a.label.localeCompare(b.label));

    return ctx;
  }

  /**
   * Wire the SF2e-style trait-selector button (mirrors SF2e vehicle sheet).
   */
  activateListeners(html) {
    // Wrap super so that if controller.onRender() throws (e.g. a missing DOM
    // element for helm-preview or sensor-radar), the sub-nav wiring below
    // always runs and panels aren't left permanently hidden.
    try {
      super.activateListeners(html);
    } catch (err) {
      console.error("causodes-shipcombat-sf2e | ShipSheet.activateListeners super error:", err);
    }

    const root = html instanceof jQuery ? html[0] : html;

    // ── Generic sub-nav handler — wires ALL nav.sub-nav elements ────────────
    // Works for both the overview tab (Crew/Components) and every role tab.
    // Expects: <nav class="sub-nav"> immediately followed by a panels container
    // that has children <div class="tab" data-sub-tab="...">
    root.querySelectorAll("nav.sub-nav").forEach(nav => {
      const panelsContainer = nav.nextElementSibling;
      if (!panelsContainer) return;
      const links  = [...nav.querySelectorAll("a[data-sub-tab]")];
      const panels = [...panelsContainer.querySelectorAll(".tab[data-sub-tab]")];
      if (!links.length) return;

      // Stable key = sorted tab names (e.g. "components|crew")
      const navKey = links.map(l => l.dataset.subTab).sort().join("|");

      // Restore previously active sub-tab, fall back to first
      if (!this._activeSubTabs) this._activeSubTabs = {};
      const savedTab   = this._activeSubTabs[navKey];
      const activeLink = (savedTab && links.find(l => l.dataset.subTab === savedTab)) ?? links[0];
      const activeTab  = activeLink.dataset.subTab;

      links.forEach(l  => l.classList.toggle("active", l === activeLink));
      panels.forEach(p => p.classList.toggle("active", p.dataset.subTab === activeTab));

      links.forEach(link => {
        link.addEventListener("click", e => {
          e.preventDefault();
          const tab = link.dataset.subTab;
          this._activeSubTabs[navKey] = tab;
          links.forEach(l  => l.classList.toggle("active", l === link));
          panels.forEach(p => p.classList.toggle("active", p.dataset.subTab === tab));
        });
      });
    });

    if (!this.isEditable) return;

    // Unassign equipment slot — X button next to installed chip
    root.querySelectorAll("[data-unassign-equip]").forEach(btn => {
      btn.addEventListener("click", () => {
        emitToGM("assignEquipment", { slotId: btn.dataset.unassignEquip, newItemId: "" });
      });
    });

    // "+" tag-selector: open ShipTraitSelector (same experience as vehicle sheet)
    root.querySelector(".tag-selector[data-tag-selector]")?.addEventListener("click", () => {
      new ShipTraitSelector(this.actor).render(true);
    });

    // IWR edit buttons
    root.querySelector("[data-action='editImmunities']")?.addEventListener("click", () => {
      new ShipIWREditor(this.actor, "di").render(true);
    });
    root.querySelector("[data-action='editWeaknesses']")?.addEventListener("click", () => {
      new ShipIWREditor(this.actor, "dv").render(true);
    });
    root.querySelector("[data-action='editResistances']")?.addEventListener("click", () => {
      new ShipIWREditor(this.actor, "dr").render(true);
    });

    // AC modifier tooltip — initialize Tooltipster on .hover[data-tooltip-content] (mirrors CharacterSheetPF2e)
    if (typeof $.fn?.tooltipster === "function") {
      for (const hoverEl of root.querySelectorAll(".hover[data-tooltip-content]")) {
        if (!hoverEl.classList.contains("tooltipstered")) {
          const contentEl = root.querySelector(hoverEl.dataset.tooltipContent);
          if (contentEl) {
            $(hoverEl).tooltipster({
              trigger: "click",
              arrow: false,
              contentAsHTML: false,
              debug: false,
              interactive: true,
              side: ["right", "bottom"],
              theme: "crb-hover",
              minWidth: 120,
              content: contentEl,
            });
          }
        }
      }
    }

    // AC modifier popup — remove, add, increment/decrement using native SF2e action names
    const acPopupId = `${this.options.id}-ship-ac-modifiers`;
    const acPopup = root.querySelector(`#${acPopupId}`);
    if (acPopup) {
      acPopup.addEventListener("click", async (e) => {
        const removeBtn = e.target.closest("[data-action='remove-modifier']");
        if (removeBtn) {
          const slug = removeBtn.dataset.slug;
          const mods = (this.actor.getFlag("causodes-shipcombat-sf2e", "acModifiers") ?? [])
            .filter((m, idx) => (m.slug ?? `custom-${idx}`) !== slug);
          await this.actor.setFlag("causodes-shipcombat-sf2e", "acModifiers", mods);
          this.render();
          return;
        }
        if (e.target.closest("[data-action='create-custom-modifier']")) {
          const addRow   = acPopup.querySelector(".item.add-modifier");
          const modValue = parseInt(addRow?.querySelector('input[type="number"]')?.value) || 0;
          const label    = addRow?.querySelector(".add-modifier-name")?.value?.trim() ?? "";
          const type     = addRow?.querySelector(".add-modifier-type")?.value || "untyped";
          if (!label) { ui.notifications.warn(game.i18n.localize("PF2E.ModifierNamePlaceholder")); return; }
          const slug = (typeof label.slugify === "function" ? label.slugify() : null) || `custom-${Date.now()}`;
          const mods = [...(this.actor.getFlag("causodes-shipcombat-sf2e", "acModifiers") ?? [])];
          mods.push({ label, modifier: modValue, type, slug });
          await this.actor.setFlag("causodes-shipcombat-sf2e", "acModifiers", mods);
          this.render();
          return;
        }
        const valInput = acPopup.querySelector('.item.add-modifier input[type="number"]');
        if (e.target.closest("[data-action='increment']")) valInput?.stepUp();
        else if (e.target.closest("[data-action='decrement']")) valInput?.stepDown();
      });
    }
  }

}

