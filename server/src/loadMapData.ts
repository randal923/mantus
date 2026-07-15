import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MapData } from "./MapData";
import { positionKey } from "./positionKey";

interface MapMeta {
  towns: Array<{ name: string; x: number; y: number; z: number }>;
  spawn: { x: number; y: number; z: number };
}

/**
 * Loads the walkability sectors + metadata produced by tools/convertOtbm.mjs.
 * The whole map stays in memory as sparse per-sector bitsets; absent sectors
 * (ocean, other floors) are unwalkable.
 */
export function loadMapData(
  dataDir: string,
  name: string,
  spawnTown?: string,
): MapData {
  const meta = JSON.parse(
    readFileSync(join(dataDir, `${name}.map.json`), "utf8"),
  ) as MapMeta;
  const buf = readFileSync(join(dataDir, `${name}.map.bin`));
  if (buf.toString("ascii", 0, 4) !== "TMAP") {
    throw new Error(`${name}.map.bin is not a TMAP file`);
  }
  const sectorSize = buf.readUInt8(5);
  const sectorCount = buf.readUInt32LE(8);
  const bytesPerSector = (sectorSize * sectorSize) / 8;
  const sectors = new Map<string, Buffer>();
  let off = 12;
  for (let i = 0; i < sectorCount; i++) {
    const sx = buf.readUInt16LE(off);
    const sy = buf.readUInt16LE(off + 2);
    const z = buf.readUInt8(off + 4);
    sectors.set(
      positionKey({ x: sx, y: sy, z }),
      buf.subarray(off + 5, off + 5 + bytesPerSector),
    );
    off += 5 + bytesPerSector;
  }

  const named = meta.towns.find(
    (t) => t.name.toLowerCase() === spawnTown?.toLowerCase(),
  );
  const spawn = named ?? meta.towns[0] ?? meta.spawn;
  if (spawn.z < 0 || spawn.z > 15) {
    throw new Error(`map ${name} has an invalid spawn floor ${spawn.z}`);
  }

  return {
    name,
    spawn: { x: spawn.x, y: spawn.y, z: spawn.z },
    isWalkable(position) {
      const { x, y, z } = position;
      if (x < 0 || y < 0 || z < 0 || z > 15) return false;
      const bits = sectors.get(
        positionKey({
          x: Math.floor(x / sectorSize),
          y: Math.floor(y / sectorSize),
          z,
        }),
      );
      if (!bits) return false;
      const bit = (y % sectorSize) * sectorSize + (x % sectorSize);
      return ((bits[bit >> 3] ?? 0) & (1 << (bit & 7))) !== 0;
    },
  };
}
