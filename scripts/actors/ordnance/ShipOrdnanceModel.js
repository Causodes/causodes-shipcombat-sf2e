/**
 * ShipOrdnanceModel — data model for the "causodes-shipcombat-sf2e.shipOrdnance"
 * actor type (unified torpedo + strike craft).
 *
 * Extends OrdnanceSchemaMixin which defines the full ordnance data schema,
 * including the `subtype` discriminator field ("torpedo" | "strikeCraft").
 */

import { sf2eMigrationField } from "../../systems/sf2e-migration-schema.js";

const { OrdnanceSchemaMixin } = globalThis.ShipCombat._api;

class _Base extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      _migration: sf2eMigrationField(fields),
      details: new fields.SchemaField({
        alliance: new fields.StringField({ initial: null, nullable: true }),
      }),
    };
  }
}

export class ShipOrdnanceModel extends OrdnanceSchemaMixin(_Base) {
  prepareBaseData()    { this.computeBase(); }
  prepareDerivedData() { this.computeDerived(); }
}
