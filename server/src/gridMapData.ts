import type { MapData } from "./MapData";

interface GridMapConfig {
  name: string;
  width: number;
  height: number;
  blocked: ReadonlyArray<readonly [number, number]>;
}

export function gridMapData(config: GridMapConfig): MapData {
  const blocked = new Set(config.blocked.map(([x, y]) => `${x},${y}`));
  return {
    name: config.name,
    spawn: {
      x: Math.floor(config.width / 2),
      y: Math.floor(config.height / 2),
      z: 7,
    },
    isWalkable(x, y, z) {
      if (z !== 7) return false;
      if (x < 0 || y < 0 || x >= config.width || y >= config.height) {
        return false;
      }
      return !blocked.has(`${x},${y}`);
    },
  };
}
