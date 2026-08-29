export function sf2eMigrationField(fields) {
  return new fields.SchemaField({
    version: new fields.NumberField({ initial: null, nullable: true, positive: true }),
    previous: new fields.SchemaField({
      foundry: new fields.StringField({ initial: null, nullable: true }),
      system:  new fields.StringField({ initial: null, nullable: true }),
      schema:  new fields.NumberField({ initial: null, nullable: true, positive: true }),
    }, { initial: null, nullable: true }),
  });
}
