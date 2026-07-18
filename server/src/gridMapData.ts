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
  floors?: ReadonlyArray<number>;
  groundSpeed?: number;
  groundSpeeds?: ReadonlyArray<readonly [number, number, number, number]>;
  transitions?: ReadonlyArray<MapTransition>;
  actions?: ReadonlyArray<MapAction>;
  items?: ReadonlyArray<{ position: Position; item: MapItem }>;
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
    (config.actions ?? []).map((action) => [positionKey(action.source), action]),
  );
  const groundSpeeds = new Map(
    (config.groundSpeeds ?? []).map(([x, y, z, speed]) => [
      positionKey({ x, y, z }),
      speed,
    ]),
  );
  const items = new Map<string, MapItem[]>();
  for (const placement of config.items ?? []) {
    const key = positionKey(placement.position);
    const tileItems = items.get(key) ?? [];
    tileItems.push(placement.item);
    items.set(key, tileItems);
  }
  return {
    name: config.name,
    spawn: {
      x: Math.floor(config.width / 2),
      y: Math.floor(config.height / 2),
      z: 7,
    },
    getTile(position) {
      const { x, y, z } = position;
      if (!floors.has(z)) return undefined;
      if (x < 0 || y < 0 || x >= config.width || y >= config.height) {
        return undefined;
      }
      const walkable = !blocked.has(positionKey(position));
      return {
        walkable,
        pathable: walkable,
        groundSpeed:
          groundSpeeds.get(positionKey(position)) ?? config.groundSpeed ?? 150,
        blocksProjectile: !walkable,
        limitsFloorView: true,
        limitsFloorViewFree: true,
        protectionZone: false,
        noPvpZone: false,
        noLogoutZone: false,
        pvpZone: false,
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
    getAction(position) {
      return actions.get(positionKey(position));
    },
    getItems(position) {
      return items.get(positionKey(position)) ?? [];
    },
    getTownName(townId) {
      return config.towns?.find((town) => town.id === townId)?.name;
    },
  };
}
