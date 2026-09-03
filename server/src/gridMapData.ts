import type { MapAction } from "./MapAction";
import type { MapData } from "./MapData";
import type { MapItem } from "./MapItem";
import type { MapTransition } from "./MapTransition";
import type { Position } from "@tibia/protocol";
import { positionKey } from "./positionKey";

interface GridMapConfig {
  name: string;
  width: number;
  height: number;
  blocked: ReadonlyArray<readonly [number, number]>;
  /** Positions with no tile at all (open air / void), as [x, y, z]. */
  voids?: ReadonlyArray<readonly [number, number, number]>;
  /** Tiles flagged as a protection zone, as [x, y, z]. */
  protectionZones?: ReadonlyArray<readonly [number, number, number]>;
  /**
   * Walkable tiles pathfinding avoids (Canary's `TILESTATE_BLOCKPATH`: a
   * table, a counter, a stone pile), as [x, y, z].
   */
  blocksPath?: ReadonlyArray<readonly [number, number, number]>;
  /** Designated pvp-zone (arena) tiles, as [x, y, z]. */
  pvpZones?: ReadonlyArray<readonly [number, number, number]>;
  /**
   * Tiles that do NOT limit floor view (an open shaft/roof gap), as [x, y, z].
   * Tiles limit floor view by default; list the ones that let sight pass.
   */
  transparentFloorView?: ReadonlyArray<readonly [number, number, number]>;
  floors?: ReadonlyArray<number>;
  groundSpeed?: number;
  groundSpeeds?: ReadonlyArray<readonly [number, number, number, number]>;
  transitions?: ReadonlyArray<MapTransition>;
  actions?: ReadonlyArray<MapAction>;
  items?: ReadonlyArray<{ position: Position; item: MapItem }>;
  /** Static trashholder tiles (water, lava, dustbin), as position + type id. */
  trashholders?: ReadonlyArray<{ position: Position; itemId: number }>;
  towns?: ReadonlyArray<{ id: number; name: string }>;
}

export function gridMapData(config: GridMapConfig): MapData {
  const floors = new Set(config.floors ?? [7]);
  const blocked = new Set(
    [...floors].flatMap((z) =>
      config.blocked.map(([x, y]) => positionKey({ x, y, z })),
    ),
  );
  const transitions = new Map(
    (config.transitions ?? []).map((transition) => [
      positionKey(transition.source),
      transition,
    ]),
  );
  const actions = new Map(
    (config.actions ?? []).map((action) => [
      `${positionKey(action.source)}|${action.activation}`,
      action,
    ]),
  );
  const voids = new Set(
    (config.voids ?? []).map(([x, y, z]) => positionKey({ x, y, z })),
  );
  const protectionZones = new Set(
    (config.protectionZones ?? []).map(([x, y, z]) =>
      positionKey({ x, y, z }),
    ),
  );
  const pvpZones = new Set(
    (config.pvpZones ?? []).map(([x, y, z]) => positionKey({ x, y, z })),
  );
  const blocksPath = new Set(
    (config.blocksPath ?? []).map(([x, y, z]) => positionKey({ x, y, z })),
  );
  const transparentFloorView = new Set(
    (config.transparentFloorView ?? []).map(([x, y, z]) =>
      positionKey({ x, y, z }),
    ),
  );
  const groundSpeeds = new Map(
    (config.groundSpeeds ?? []).map(([x, y, z, speed]) => [
      positionKey({ x, y, z }),
      speed,
    ]),
  );
  const trashholders = new Map(
    (config.trashholders ?? []).map((entry) => [
      positionKey(entry.position),
      entry.itemId,
    ]),
  );
  const items = new Map<string, MapItem[]>();
  for (const placement of config.items ?? []) {
    const key = positionKey(placement.position);
    const tileItems = items.get(key) ?? [];
    tileItems.push(placement.item);
    items.set(key, tileItems);
  }
  const spawn = {
    x: Math.floor(config.width / 2),
    y: Math.floor(config.height / 2),
    z: 7,
  };
  return {
    name: config.name,
    spawn,
    getTile(position) {
      const { x, y, z } = position;
      if (!floors.has(z)) return undefined;
      if (x < 0 || y < 0 || x >= config.width || y >= config.height) {
        return undefined;
      }
      if (voids.has(positionKey(position))) return undefined;
      const walkable = !blocked.has(positionKey(position));
      const limitsFloorView = !transparentFloorView.has(positionKey(position));
      return {
        walkable,
        pathable: walkable && !blocksPath.has(positionKey(position)),
        groundSpeed:
          groundSpeeds.get(positionKey(position)) ?? config.groundSpeed ?? 150,
        blocksProjectile: !walkable,
        limitsFloorView,
        limitsFloorViewFree: limitsFloorView,
        protectionZone: protectionZones.has(positionKey(position)),
        noPvpZone: false,
        noLogoutZone: false,
        pvpZone: pvpZones.has(positionKey(position)),
      };
    },
    isWalkable(position, pathfinding = false) {
      const tile = this.getTile(position);
      return pathfinding ? (tile?.pathable ?? false) : (tile?.walkable ?? false);
    },
    getGroundSpeed(position) {
      return this.getTile(position)?.groundSpeed;
    },
    blocksProjectile(position) {
      return this.getTile(position)?.blocksProjectile ?? true;
    },
    getTransition(position) {
      return transitions.get(positionKey(position));
    },
    getAction(position, activation) {
      return actions.get(`${positionKey(position)}|${activation}`);
    },
    getItems(position) {
      return items.get(positionKey(position)) ?? [];
    },
    getTrashholderTypeId(position) {
      return trashholders.get(positionKey(position));
    },
    getTownName(townId) {
      return config.towns?.find((town) => town.id === townId)?.name;
    },
    getTownTemples() {
      return [{ ...spawn }];
    },
    getTownTemple(townId) {
      return config.towns?.some((town) => town.id === townId)
        ? { ...spawn }
        : undefined;
    },
  };
}
