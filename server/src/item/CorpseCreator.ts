import { randomUUID } from "node:crypto";
import type { Position } from "@tibia/protocol";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import type { DecayManager } from "./DecayManager";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import type { LootItemCreation } from "./LootItemCreation";
import { MAX_CORPSE_LOOT_ITEMS } from "./maxCorpseLootItems";

/**
 * Creates corpses with loot as memory-only world items, synchronously on the
 * death tick. No DB row exists until a player first touches the corpse or its
 * loot — the touching plan inserts the rows plus the creation audit in its own
 * transaction (see appendUnpersistedLootInserts). Untouched corpses decay in
 * memory and are lost on restart, which is the intended volatility.
 */
export class CorpseCreator {
  constructor(
    private readonly catalog: ItemCatalog,
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly decay?: DecayManager,
  ) {}

  /** Returns the new corpse's id, or null when the corpse was rejected. */
  create(
    characterId: string | null,
    eventId: string,
    position: Position,
    stackIndex: number,
    corpseTypeId: number,
    loot: ReadonlyArray<LootItemCreation>,
    now: number,
  ): string | null {
    if (!/^[A-Za-z0-9:_-]{1,128}$/.test(eventId)) {
      console.warn(`corpse creation skipped: invalid event id ${eventId}`);
      return null;
    }
    if (!Number.isInteger(stackIndex) || stackIndex < 0 || stackIndex > 255) {
      console.warn(`corpse creation skipped for ${eventId}: bad stack index`);
      return null;
    }
    const corpseType = this.catalog.require(corpseTypeId);
    // The corpse is sized to its loot, not the other way round; the only
    // ceilings are "a container at all" and the persisted slot bound.
    if (loot.length > 0 && corpseType.containerCapacity === undefined) {
      console.warn(`corpse creation skipped for ${eventId}: not a container`);
      return null;
    }
    if (loot.length > MAX_CORPSE_LOOT_ITEMS) {
      console.warn(`corpse creation skipped for ${eventId}: loot overflow`);
      return null;
    }
    for (const entry of loot) {
      const type = this.catalog.require(entry.typeId);
      if (
        !Number.isInteger(entry.count) ||
        entry.count < 1 ||
        entry.count > type.maxCount
      ) {
        console.warn(`corpse creation skipped for ${eventId}: bad loot count`);
        return null;
      }
    }
    const corpseId = randomUUID();
    const corpse: Item = {
      id: corpseId,
      typeId: corpseTypeId,
      count: 1,
      attributes: characterId ? { ownerCharacterId: characterId } : {},
      version: 1,
      location: { kind: "world", position: { ...position }, stackIndex },
    };
    const contents = loot.map<Item>((entry, slot) => ({
      id: randomUUID(),
      typeId: entry.typeId,
      count: entry.count,
      // Rolled rarity/affixes ride along; the first-touch insert persists
      // whatever bag the item was born with.
      attributes: entry.attributes ? { ...entry.attributes } : {},
      version: 1,
      location: { kind: "corpse", containerId: corpseId, slot },
    }));
    const items = [corpse, ...contents];
    const positions = this.world.applyCreatedWorldItems(items);
    this.world.registerUnpersistedLootItems(items, {
      eventId,
      killerCharacterId: characterId,
    });
    this.visibility.onMapItemsChanged(positions);
    this.decay?.observeCreated(items, now);
    return corpseId;
  }
}
