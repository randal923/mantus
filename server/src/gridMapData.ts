import type { MapData } from "./MapData";
import { positionKey } from "./positionKey";

interface GridMapConfig {
  name: string;
  width: number;
  height: number;
  blocked: ReadonlyArray<readonly [number, number]>;
}

export function gridMapData(config: GridMapConfig): MapData {
  const blocked = new Set(
    config.blocked.map(([x, y]) => positionKey({ x, y, z: 7 })),
  );
  return {
    name: config.name,
    spawn: {
      x: Math.floor(config.width / 2),
      y: Math.floor(config.height / 2),
      z: 7,
    },
    isWalkable(position) {
      const { x, y, z } = position;
      if (z !== 7) return false;
      if (x < 0 || y < 0 || x >= config.width || y >= config.height) {
        return false;
      }
      return !blocked.has(positionKey(position));
    },
  };
}
