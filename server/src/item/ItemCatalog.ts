import type { ItemType } from "./ItemType";

export class ItemCatalog {
  private readonly items: ReadonlyMap<number, ItemType>;

  constructor(items: ReadonlyArray<ItemType>) {
    this.items = new Map(items.map((item) => [item.id, item]));
    if (this.items.size !== items.length) {
      throw new Error("item catalog contains duplicate ids");
    }
  }

  get(id: number): ItemType | undefined {
    return this.items.get(id);
  }

  require(id: number): ItemType {
    const item = this.items.get(id);
    if (!item) throw new Error(`unknown item type ${id}`);
    return item;
  }
}
