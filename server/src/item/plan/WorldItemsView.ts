import type { Position } from "@tibia/protocol";
import type { Item } from "../Item";
import type { MapItem } from "../../MapItem";

/** The slice of World state the ground-op planners read. */
export interface WorldItemsView {
  getMapItems(position: Position): ReadonlyArray<MapItem>;
  getWorldItem(instanceId: string): Item | undefined;
  getWorldSubtree(rootId: string): ReadonlyArray<Item>;
}
