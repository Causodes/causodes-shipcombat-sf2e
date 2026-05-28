/**
 * ShipComponentModel — data model for the "causodes-shipcombat-sf2e.component"
 * item type.
 *
 * Extends ShipComponentSchemaMixin which defines the full component data schema.
 * Uses TypeDataModel as the base class (same pattern as ShipModel).
 */

const { ShipComponentSchemaMixin } = globalThis.ShipCombat._api;

class _Base extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      /** Starfinder item level (0–20), displayed in the sheet header. */
      tier: new fields.NumberField({ initial: 0, min: 0, max: 20, integer: true }),
      /** Rarity tag shown in the sheet header (common / uncommon / rare / unique). */
      rarity: new fields.StringField({ initial: "common", choices: { common: "PF2E.TraitCommon", uncommon: "PF2E.TraitUncommon", rare: "PF2E.TraitRare", unique: "PF2E.TraitUnique" } }),
      /** Structured damage: number of dice (replaces the free-text damage string). */
      diceCount: new fields.NumberField({ initial: 1, min: 0, integer: true }),
      /** Structured damage: die size (d4–d12). */
      dieSize: new fields.StringField({
        initial: "d6",
        choices: { d4: "d4", d6: "d6", d8: "d8", d10: "d10", d12: "d12" },
      }),
      /** How much this component contributes to the ship's Armour Class (armour and engine slots only). */
      armourClassContribution: new fields.NumberField({ initial: 0, min: 0, integer: true }),

    };
  }
}

export class ShipComponentModel extends ShipComponentSchemaMixin(_Base) {}
