export interface LootItemCreation {
  readonly typeId: number;
  readonly count: number;
  /**
   * Attribute bag rolled at loot time (rarity grade and affixes). Absent on
   * the overwhelming majority of drops; carried verbatim onto the created
   * item row.
   */
  readonly attributes?: Readonly<Record<string, unknown>>;
}
