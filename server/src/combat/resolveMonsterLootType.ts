import type { MonsterLoot } from "../creature/MonsterType";
import type { ItemType } from "../item/ItemType";

export interface MonsterLootTypeLookup {
  readonly byId: (itemTypeId: number) => ItemType | undefined;
  readonly byName: (itemName: string) => ItemType | undefined;
}

/**
 * Resolves one pinned loot entry to a catalog item type. Canary tables name an
 * item either by id or by display name; the id wins when both are present, and
 * an entry naming an item this build's catalog does not carry resolves to
 * nothing rather than to a neighbouring id (the loot parity report pins how
 * many such entries exist).
 */
export function resolveMonsterLootType(
  entry: MonsterLoot,
  lookup: MonsterLootTypeLookup,
): ItemType | undefined {
  return (
    (entry.itemTypeId === undefined
      ? undefined
      : lookup.byId(entry.itemTypeId)) ??
    (entry.itemName === undefined ? undefined : lookup.byName(entry.itemName))
  );
}
