import type { ItemType } from "./ItemType";

export class ItemCatalog {
  private readonly items: ReadonlyMap<number, ItemType>;
  private readonly itemsByName: ReadonlyMap<string, ItemType>;

  constructor(items: ReadonlyArray<ItemType>) {
    this.items = new Map(items.map((item) => [item.id, item]));
    if (this.items.size !== items.length) {
      throw new Error("item catalog contains duplicate ids");
    }
    const byName = new Map<string, ItemType>();
    for (const item of [...items].sort((left, right) => left.id - right.id)) {
      const key = item.name.trim().toLowerCase();
      if (!byName.has(key)) byName.set(key, item);
    }
    this.itemsByName = byName;
  }

  get(id: number): ItemType | undefined {
    return this.items.get(id);
  }

  require(id: number): ItemType {
    const item = this.items.get(id);
    if (!item) throw new Error(`unknown item type ${id}`);
    return item;
  }

  findByName(name: string): ItemType | undefined {
    return this.itemsByName.get(name.trim().toLowerCase());
  }

  /** Lowest-id item mapped to a weapon-proficiency profile (Feature 82). */
  findByProficiencyId(proficiencyId: number): ItemType | undefined {
    if (!this.itemsByProficiencyId) {
      const byProficiency = new Map<number, ItemType>();
      for (const item of [...this.items.values()].sort(
        (left, right) => left.id - right.id,
      )) {
        if (item.proficiencyId !== undefined && !byProficiency.has(item.proficiencyId)) {
          byProficiency.set(item.proficiencyId, item);
        }
      }
      this.itemsByProficiencyId = byProficiency;
    }
    return this.itemsByProficiencyId.get(proficiencyId);
  }

  private itemsByProficiencyId?: Map<number, ItemType>;

  searchByName(query: string): ReadonlyArray<ItemType> {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) return [];
    return [...this.items.values()].filter((item) =>
      item.name.toLowerCase().includes(normalized),
    );
  }
}
