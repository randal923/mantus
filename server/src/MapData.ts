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
  /**
   * One action per tile *per activation*: a sewer grate is both a `use`
   * dropdown and a `use-with` rope hole, exactly as Canary registers it.
   */
  getAction(
    position: Position,
    activation: MapAction["activation"],
  ): MapAction | undefined;
  getItems(position: Position): ReadonlyArray<MapItem>;
  getTownName?(townId: number): string | undefined;
  /** Every town's temple position, for temple-proximity rules (wheel respec). */
  getTownTemples?(): ReadonlyArray<Position>;
  /** House id owning this tile, when the map ships house metadata. */
  getHouseId?(position: Position): number | undefined;
  /** Every tile of one house, for eviction sweeps and occupant checks. */
  getHouseTiles?(houseId: number): ReadonlyArray<Position> | undefined;
}
