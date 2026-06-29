/**
 * NpcShipModel — data model for the "causodes-shipcombat-sf2e.npcShip"
 * actor type.
 *
 * Extends NpcShipSchemaMixin which defines the full NPC ship data schema.
 * The `combat` SchemaField is not needed for SF2e (no system-specific display
 * stubs required at this time).
 */

const { NpcShipSchemaMixin } = globalThis.ShipCombat._api;

class _Base extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      // SF2e-compatible trait fields used by the header rarity/size selects,
      // the tagify-tags traits row (traits.value), and the IWR editor (di/dv/dr).
      traits: new fields.SchemaField({
        rarity: new fields.StringField({ initial: "common", nullable: false }),
        size: new fields.SchemaField({
          value: new fields.StringField({ initial: "lg", nullable: false }),
        }),
        value: new fields.ArrayField(new fields.StringField()),   // content traits (acid, fire, …)
        // Damage / condition immunities (type-slug strings), weaknesses, resistances.
        // Schema mirrors ShipModel so ShipIWREditor writes to the correct paths.
        di: new fields.ArrayField(
          new fields.StringField({ blank: false, trim: true }),
          { initial: ["object-immunities"] }
        ),
        dv: new fields.ArrayField(
          new fields.SchemaField({
            type:  new fields.StringField({ blank: false, trim: true }),
            value: new fields.NumberField({ integer: true, min: 0, initial: 5, nullable: false }),
          }),
          { initial: [] }
        ),
        dr: new fields.ArrayField(
          new fields.SchemaField({
            type:  new fields.StringField({ blank: false, trim: true }),
            value: new fields.NumberField({ integer: true, min: 0, initial: 5, nullable: false }),
          }),
          { initial: [] }
        ),
      }),
      // Level, elite/weak adjustment, and blurb (mirrors SF2e NPC details schema).
      details: new fields.SchemaField({
        level: new fields.SchemaField({
          value: new fields.NumberField({ initial: 1, nullable: false, integer: true }),
        }),
        adjustment: new fields.StringField({ initial: "", nullable: false }), // "" | "elite" | "weak"
        blurb:      new fields.StringField({ initial: "" }),
      }),
      // SF2e d20 Armor Class — not in the core schema (impmal uses armour sectors instead).
      // Must be defined here so Foundry's TypeDataModel.clean() preserves the value.
      armorClass: new fields.NumberField({ initial: 0, nullable: false, integer: true, min: 0 }),
    };
  }
}

export class NpcShipModel extends NpcShipSchemaMixin(_Base) {
  prepareBaseData()    { this.computeBase(); }
  prepareDerivedData() { this.computeDerived(); }
}
