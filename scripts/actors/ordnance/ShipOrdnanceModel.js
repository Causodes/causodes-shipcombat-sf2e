/**
 * ShipOrdnanceModel — data model for the "causodes-shipcombat-sf2e.shipOrdnance"
 * actor type (unified torpedo + strike craft).
 *
 * Extends OrdnanceSchemaMixin which defines the full ordnance data schema,
 * including the `subtype` discriminator field ("torpedo" | "strikeCraft").
 */

const { OrdnanceSchemaMixin } = globalThis.ShipCombat._api;

class _Base extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {};
  }
}

export class ShipOrdnanceModel extends OrdnanceSchemaMixin(_Base) {}
