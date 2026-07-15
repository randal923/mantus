import type { Direction, Position } from "@tibia/protocol";
import type { MapAction } from "./MapAction";
import type { MapItem } from "./MapItem";
import type { MapTransition } from "./MapTransition";

export interface MapTile {
  readonly walkable: boolean;
  readonly pathable: boolean;
  readonly groundSpeed: number;
  readonly blocksProjectile: boolean;
  readonly limitsFloorView: boolean;
  readonly limitsFloorViewFree: boolean;
  readonly protectionZone: boolean;
  readonly noPvpZone: boolean;
  readonly noLogoutZone: boolean;
  readonly pvpZone: boolean;
}

export interface MapData {
  name: string;
  spawn: Position;
  getTile(position: Position): MapTile | undefined;
  isWalkable(position: Position, pathfinding?: boolean): boolean;
  getGroundSpeed(position: Position): number | undefined;
  blocksProjectile(position: Position): boolean;
  getTransition(
    position: Position,
    direction: Direction,
  ): MapTransition | undefined;
  getAction(position: Position): MapAction | undefined;
  getItems(position: Position): ReadonlyArray<MapItem>;
}
