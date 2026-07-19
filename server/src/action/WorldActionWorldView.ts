import type { Position, ViewRange } from "@tibia/protocol";
import type { MapAction } from "../MapAction";
import type { WorldItemsView } from "../item/plan/WorldItemsView";

/** The slice of World state the world-action resolution and handlers read. */
export interface WorldActionWorldView extends WorldItemsView {
  getMapAction(position: Position): MapAction | undefined;
  canSee(viewer: Position, target: Position, range: ViewRange): boolean;
  isOccupied(position: Position): boolean;
}
