import { readFileSync } from "node:fs";

/**
 * Reads the converted map's TMAP navigation block: the per-tile present and
 * walkable bitsets the OTBM converter emits. Importers use it to prove
 * statically that a placement or a travel destination lands on a real,
 * walkable tile, instead of discovering it live at execution time.
 */
export function readMapNavigation(path) {
  const buffer = readFileSync(path);
  if (buffer.toString("ascii", 0, 4) !== "TMAP" || buffer.readUInt8(4) !== 3) {
    throw new Error("navigation data must be version 3 TMAP");
  }
  const sectorSize = buffer.readUInt8(5);
  const sectorCount = buffer.readUInt32LE(8);
  const bitsetBytes = (sectorSize * sectorSize) / 8;
  const entrySize = 5 + bitsetBytes * 10 + (sectorSize * sectorSize * 5) / 8;
  if (buffer.length !== 12 + sectorCount * entrySize) {
    throw new Error("TMAP navigation length does not match its sector count");
  }
  const sectors = new Map();
  let offset = 12;
  for (let index = 0; index < sectorCount; index++) {
    const x = buffer.readUInt16LE(offset);
    const y = buffer.readUInt16LE(offset + 2);
    const z = buffer.readUInt8(offset + 4);
    const present = buffer.subarray(offset + 5, offset + 5 + bitsetBytes);
    const walkable = buffer.subarray(
      offset + 5 + bitsetBytes,
      offset + 5 + bitsetBytes * 2,
    );
    sectors.set(`${x},${y},${z}`, { present, walkable });
    offset += entrySize;
  }
  const tileAt = (position) => {
    const sector = sectors.get(
      `${Math.floor(position.x / sectorSize)},${Math.floor(position.y / sectorSize)},${position.z}`,
    );
    if (!sector) return "missing";
    const bit =
      (position.y % sectorSize) * sectorSize + (position.x % sectorSize);
    const present = (sector.present[bit >> 3] & (1 << (bit & 7))) !== 0;
    if (!present) return "missing";
    const walkable = (sector.walkable[bit >> 3] & (1 << (bit & 7))) !== 0;
    return walkable ? "walkable" : "blocked";
  };
  return {
    tileAt,
    /**
     * The server lands a traveller on the nearest free tile within `radius`,
     * so a destination is reachable when any tile in that box is walkable.
     */
    hasWalkableWithin(position, radius) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (
            tileAt({ x: position.x + dx, y: position.y + dy, z: position.z }) ===
            "walkable"
          ) {
            return true;
          }
        }
      }
      return false;
    },
  };
}
