import { ShipComponentSheetMixin } from "../../../causodes-shipcombat-core/scripts/items/ShipComponentSheetMixin.js";

// Extend the Foundry AppV2 item sheet base so the component sheet uses the
// standard SF2e item sheet look-and-feel.  We apply classes "pf2e" and "item"
// so SF2e's own sf2e.css item sheet rules (scoped to ".pf2e.item.sheet") apply.
export class ShipComponentSheet extends ShipComponentSheetMixin(
  foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sheets.ItemSheetV2)
) {
  static DEFAULT_OPTIONS = {
    classes: ["pf2e", "item", "sheet", "causodes-shipcombat-sf2e", "shipcombat-component"],
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.item.system;
    context.dieSizeChoices = ["d4", "d6", "d8", "d10", "d12"].map(die => ({
      value: die,
      label: die,
      selected: die === (sys.dieSize ?? "d6"),
    }));
    return context;
  }
}
