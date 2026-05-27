import { OrdnanceSheetV1Mixin } from "../../../../causodes-shipcombat-core/scripts/actors/ordnance/OrdnanceSheetMixin.js";
import { SystemAdapter } from "../../../../causodes-shipcombat-core/scripts/systems/SystemAdapter.js";

export class OrdnanceSheet extends OrdnanceSheetV1Mixin(foundry.appv1.sheets.ActorSheet) {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: [...(super.defaultOptions.classes ?? []), "crb-style", "vehicle", "shipcombat-ship", "shipcombat-ordnance"],
      template: "modules/causodes-shipcombat-sf2e/templates/actor/ordnance-sheet-sf2e.hbs",
      // contentSelector points at .sheet-content; the self-wrapping partials
      // are direct children (section.tab[data-tab="main"] etc.) so the Tabs
      // class can find and toggle them correctly.
      tabs: [{ navSelector: ".ordnance-sheet-tabs", contentSelector: ".sheet-content", initial: "main" }],
    });
  }

  activateListeners($html) {
    super.activateListeners($html);
    // Rename labels in the strike craft config for SF2e nomenclature.
    // The labels are inline in the core ordnance-config.hbs template; patching
    // post-render is the SF2e-only approach that avoids touching core.
    const RENAMES = { ASR: "OPT", RTG: "HIT" };
    for (const label of $html[0].querySelectorAll(".shipcombat-torpedo-stat label")) {
      const replacement = RENAMES[label.textContent.trim()];
      if (replacement) label.textContent = replacement;
    }
  }

  async getData(options) {
    const ctx = await super.getData(options);
    // Provide tab context objects so {{tab.id}} in the Core partials renders
    // the correct data-tab value instead of empty string.
    ctx.tabsById = {
      main:   { id: "main",   cssClass: "" },
      config: { id: "config", cssClass: "" },
    };
    // Provide SF2e damage type choices for the payload type selector.
    ctx.damageTypeChoices = SystemAdapter.current.getDamageTypeChoices();
    ctx.useDiceBreakdown  = true;
    ctx.showArmorClass    = true;
    ctx.diceOptions = [
      { value: "d4",  label: "d4"  },
      { value: "d6",  label: "d6"  },
      { value: "d8",  label: "d8"  },
      { value: "d10", label: "d10" },
      { value: "d12", label: "d12" },
    ];
    return ctx;
  }
}
