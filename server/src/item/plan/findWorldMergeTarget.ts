import type { Position } from "@tibia/protocol";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { WorldItemsView } from "./WorldItemsView";

/**
 * The lowest-stacked materialized world stack on the tile that the source
 * stack can merge into — the memory mirror of the DB-side merge-target lock
 * (seeded rows are never merge targets).
 */
export function findWorldMergeTarget(
  catalog: ItemCatalog,
  world: WorldItemsView,
  position: Position,
  source: Item,
): Item | undefined {
  const type = catalog.require(source.typeId);
  const attributes = JSON.stringify(source.attributes);
  return world
    .getMapItems(position)
    .slice()
    .sort((left, right) => left.stackIndex - right.stackIndex)
    .flatMap((tileItem) => {
      const candidate = world.getWorldItem(tileItem.instanceId);
      return candidate ? [candidate] : [];
    })
    .find(
      (candidate) =>
        candidate.id !== source.id &&
        !candidate.seedKey &&
        candidate.typeId === source.typeId &&
        JSON.stringify(candidate.attributes) === attributes &&
        candidate.count + source.count <= type.maxCount,
    );
}
