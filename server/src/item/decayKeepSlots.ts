import { MAX_CONTAINER_CAPACITY } from "@tibia/protocol";
import type { ItemCatalog } from "./ItemCatalog";

/**
 * How many leading slots survive when a world container decays into
 * `targetTypeId`. A container stage keeps everything: Canary's same-kind
 * `transformItem` only swaps the id, and a corpse is sized to its loot, so
 * its slot count says nothing about what it holds. A stage that is not a
 * container empties it. Shared by the tick runner and both item stores so
 * the three never disagree.
 */
export function decayKeepSlots(
  catalog: ItemCatalog,
  targetTypeId: number,
): number {
  return catalog.require(targetTypeId).containerCapacity === undefined
    ? 0
    : MAX_CONTAINER_CAPACITY;
}
