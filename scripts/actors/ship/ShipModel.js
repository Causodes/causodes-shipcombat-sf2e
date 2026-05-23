/**
 * ShipModel — data model for the "causodes-shipcombat-sf2e.ship" actor type.
 *
 * Extends ShipSchemaMixin which defines the full ship data schema in system.*.
 * All ship-combat state lives here, so no flags-based storage is needed and
 * the base SystemAdapter.getShipData() / systemPath() defaults work as-is.
 */

import { ShipSchemaMixin } from "../../../../causodes-shipcombat-core/scripts/actors/ship/ShipSchema.js";

// TypeDataModel.defineSchema() is abstract and throws; provide a concrete base
// so the mixin chain's super.defineSchema() calls return {} rather than throwing.
class _Base extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      // SF2e-compatible trait fields used by the header selectors
      traits: new fields.SchemaField({
        rarity: new fields.StringField({ initial: "common", nullable: false }),
        size: new fields.SchemaField({
          value: new fields.StringField({ initial: "lg", nullable: false }),
        }),
        // Custom trait slugs added via the "+" button on the overview tab
        value: new fields.ArrayField(
          new fields.StringField({ blank: false, trim: true })
        ),
        // Damage / condition immunities, weaknesses, resistances (GM-editable)
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
      // Level — displayed in the header shield (mirrors SF2e vehicle)
      details: new fields.SchemaField({
        level: new fields.SchemaField({
          value: new fields.NumberField({ initial: 1, nullable: false, integer: true }),
        }),
      }),
      // Vehicle identity / details
      classification: new fields.StringField({ initial: "", nullable: false }),
      model:          new fields.StringField({ initial: "", nullable: false }),
      crew:           new fields.StringField({ initial: "", nullable: false }),
      passengers:     new fields.StringField({ initial: "", nullable: false }),
      price:          new fields.NumberField({ initial: 0,  nullable: false, integer: true, min: 0 }),
      armorClass:     new fields.NumberField({ initial: 10, nullable: false, integer: true, min: 0 }),
      acDetails:      new fields.StringField({ initial: "", nullable: false }),
    };
  }
}

export class ShipModel extends ShipSchemaMixin(_Base) {
  prepareBaseData()    { this.computeBase(); }
  prepareDerivedData() {
    this.computeDerived();
    this._computeArmorClass();
  }

  /**
   * Sum the `armourClassContribution` of all equipped armour and engine
   * components owned by this ship actor and store the result in `armorClass`.
   * Called during prepareDerivedData so the value updates whenever items change.
   */
  _computeArmorClass() {
    const actor = this.parent;
    if (!actor?.items) return;
    const COMPONENT_TYPE = "causodes-shipcombat-sf2e.component";
    let ac = 0;
    for (const item of actor.items) {
      if (item.type !== COMPONENT_TYPE) continue;
      const slot = item.system?.slot;
      if (slot !== "armour" && slot !== "engine") continue;
      if (item.system?.equipped === false) continue;
      ac += Number(item.system?.armourClassContribution ?? 0);
    }
    this.armorClass = ac;
  }
}
