import type { MapItemState } from "@tibia/protocol";
import type { TibiaObject } from "./AssetStore";
import type { TileRenderItem } from "./getTileRenderLayers";

/** Reconstructs source stack positions after mutable items were split from static regions. */
export function getMergedTileItems(
  staticItemIds: ReadonlyArray<number>,
  dynamicItems: ReadonlyArray<MapItemState>,
  getAppearance: (itemId: number) => TibiaObject,
  staticInstancePrefix: string,
): TileRenderItem<TibiaObject>[] {
  const occupied = new Set<number>();
  const merged: TileRenderItem<TibiaObject>[] = [];
  for (const item of [...dynamicItems].sort(
    (left, right) => left.stackIndex - right.stackIndex,
  )) {
    if (occupied.has(item.stackIndex)) continue;
    occupied.add(item.stackIndex);
    merged.push({
      instanceId: item.instanceId,
      stackIndex: item.stackIndex,
      object: getAppearance(item.itemId),
    });
  }

  let stackIndex = 0;
  for (const [staticIndex, itemId] of staticItemIds.entries()) {
    while (occupied.has(stackIndex)) stackIndex++;
    merged.push({
      instanceId: `${staticInstancePrefix}:static:${staticIndex}:${itemId}`,
      stackIndex,
      object: getAppearance(itemId),
    });
    stackIndex++;
  }
  return merged.sort((left, right) => left.stackIndex - right.stackIndex);
}
