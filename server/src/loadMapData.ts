import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MapData } from "./MapData";

/** Gameplay is single-floor until stairs/ladders exist (see TODO.md). */
const GAMEPLAY_FLOOR = 7;

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
    if (z === GAMEPLAY_FLOOR) {
      sectors.set(`${sx},${sy}`, buf.subarray(off + 5, off + 5 + bytesPerSector));
    }
    off += 5 + bytesPerSector;
  }

  const groundTowns = meta.towns.filter((t) => t.z === GAMEPLAY_FLOOR);
  const named = groundTowns.find(
    (t) => t.name.toLowerCase() === spawnTown?.toLowerCase(),
  );
  const spawn = named ?? groundTowns[0] ?? meta.spawn;
  if (spawn.z !== GAMEPLAY_FLOOR) {
    throw new Error(`map ${name} has no spawn on floor ${GAMEPLAY_FLOOR}`);
  }

  return {
    name,
    spawn: { x: spawn.x, y: spawn.y },
    isWalkable(x, y) {
      if (x < 0 || y < 0) return false;
      const bits = sectors.get(
        `${Math.floor(x / sectorSize)},${Math.floor(y / sectorSize)}`,
      );
      if (!bits) return false;
      const bit = (y % sectorSize) * sectorSize + (x % sectorSize);
      return ((bits[bit >> 3] ?? 0) & (1 << (bit & 7))) !== 0;
    },
  };
}
