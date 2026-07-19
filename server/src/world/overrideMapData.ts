import type { Position } from "@tibia/protocol";
import type { MapData } from "../MapData";
import type { TilePassabilityOverride } from "./DynamicMapItems";

/**
 * Wraps static map data with per-tile passability overrides owned by
 * stateful map items (open/closed doors). Movement, occupancy, and line of
 * sight all read through this view so door state is authoritative at
 * execution time.
 */
export function overrideMapData(
  map: MapData,
  overrides: {
    getTileOverride(position: Position): TilePassabilityOverride | undefined;
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
      return map.getGroundSpeed(position);
    },
    blocksProjectile(position) {
      const override = overrides.getTileOverride(position);
      return override !== undefined
        ? override.blocksProjectile
        : map.blocksProjectile(position);
    },
    getTransition(position, direction) {
      return map.getTransition(position, direction);
    },
    getAction(position) {
      return map.getAction(position);
    },
    getItems(position) {
      return map.getItems(position);
    },
    getTownName: map.getTownName
      ? (townId) => map.getTownName!(townId)
      : undefined,
    getHouseId: map.getHouseId
      ? (position) => map.getHouseId!(position)
      : undefined,
    getHouseTiles: map.getHouseTiles
      ? (houseId) => map.getHouseTiles!(houseId)
      : undefined,
  };
}
