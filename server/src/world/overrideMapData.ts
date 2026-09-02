import type { Position } from "@tibia/protocol";
import type { MapData } from "../MapData";
import type { MapTransition } from "../MapTransition";
import type { TilePassabilityOverride } from "./DynamicMapItems";

/**
 * Wraps static map data with per-tile passability overrides owned by
 * stateful map items (open/closed doors, shovel holes). Movement, occupancy,
 * and line of sight all read through this view so door and hole state is
 * authoritative at execution time.
 */
export function overrideMapData(
  map: MapData,
  overrides: {
    getTileOverride(position: Position): TilePassabilityOverride | undefined;
    getHoleTransition(position: Position): MapTransition | undefined;
  },
): MapData {
  return {
    name: map.name,
    spawn: map.spawn,
    getTile(position) {
      const tile = map.getTile(position);
      const override = overrides.getTileOverride(position);
      if (!tile || !override) return tile;
      return {
        ...tile,
        walkable: override.walkable,
        pathable: override.walkable,
        blocksProjectile: override.blocksProjectile,
      };
    },
    isWalkable(position, pathfinding = false) {
      const override = overrides.getTileOverride(position);
      if (override !== undefined) {
        return map.getTile(position) ? override.walkable : false;
      }
      return map.isWalkable(position, pathfinding);
    },
    getGroundSpeed(position) {
      const override = overrides.getTileOverride(position);
      if (override?.groundSpeed !== undefined) return override.groundSpeed;
      return map.getGroundSpeed(position);
    },
    blocksProjectile(position) {
      const override = overrides.getTileOverride(position);
      return override !== undefined
        ? override.blocksProjectile
        : map.blocksProjectile(position);
    },
    getTransition(position, direction) {
      return (
        overrides.getHoleTransition(position) ??
        map.getTransition(position, direction)
      );
    },
    getAction(position, activation) {
      return map.getAction(position, activation);
    },
    getItems(position) {
      return map.getItems(position);
    },
    getTrashholderTypeId: map.getTrashholderTypeId
      ? (position) => map.getTrashholderTypeId!(position)
      : undefined,
    getTownName: map.getTownName
      ? (townId) => map.getTownName!(townId)
      : undefined,
    getTownTemples: map.getTownTemples
      ? () => map.getTownTemples!()
      : undefined,
    getTownTemple: map.getTownTemple
      ? (townId) => map.getTownTemple!(townId)
      : undefined,
    getHouseId: map.getHouseId
      ? (position) => map.getHouseId!(position)
      : undefined,
    getHouseTiles: map.getHouseTiles
      ? (houseId) => map.getHouseTiles!(houseId)
      : undefined,
  };
}
