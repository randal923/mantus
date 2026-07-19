import type { Position } from "@tibia/protocol";
import type { Item } from "../Item";
import type { LootOrigin } from "../LootOrigin";
import type { MapItem } from "../../MapItem";

/** The slice of World state the ground-op planners read. */
export interface WorldItemsView {
  getMapItems(position: Position): ReadonlyArray<MapItem>;
  getWorldItem(instanceId: string): Item | undefined;
  getWorldSubtree(rootId: string): ReadonlyArray<Item>;
  /** Set for corpse/loot items that have no DB row yet (memory-only). */
  lootOrigin(itemId: string): LootOrigin | undefined;
}
