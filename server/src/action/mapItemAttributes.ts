import type { WorldItemsView } from "../item/plan/WorldItemsView";
import type { MapItem } from "../MapItem";

/** Current attributes of a map item: materialized row first, else map seed. */
export function mapItemAttributes(
  world: WorldItemsView,
  item: MapItem,
): Readonly<Record<string, unknown>> {
  return (
    world.getWorldItem(item.instanceId)?.attributes ??
    item.source?.attributes ??
    {}
  );
}
