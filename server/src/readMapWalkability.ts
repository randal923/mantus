import { readFileSync } from "node:fs";
import type { Position } from "@tibia/protocol";

export type TileState = "missing" | "blocked" | "walkable";

/**
 * Reads the tile-presence and walkability bitsets out of a converted
 * `<name>.map.bin` without building a World. Tests and playtest scenarios use
 * it to prove statically that a table entry stands on a tile a player can
 * reach and lands them somewhere they can stand.
 */
export function readMapWalkability(path: string): (position: Position) => TileState {
  const buffer = readFileSync(path);
  if (buffer.toString("ascii", 0, 4) !== "TMAP" || buffer.readUInt8(4) !== 3) {
    throw new Error("map navigation data must be version 3 TMAP");
  }
  const sectorSize = buffer.readUInt8(5);
  const sectorCount = buffer.readUInt32LE(8);
  const bitsetBytes = (sectorSize * sectorSize) / 8;
  const entrySize = 5 + bitsetBytes * 10 + (sectorSize * sectorSize * 5) / 8;
  if (buffer.length !== 12 + sectorCount * entrySize) {
    throw new Error("TMAP navigation length does not match its sector count");
  }
  const sectors = new Map<string, { present: Buffer; walkable: Buffer }>();
  let offset = 12;
  for (let index = 0; index < sectorCount; index++) {
    const x = buffer.readUInt16LE(offset);
    const y = buffer.readUInt16LE(offset + 2);
    const z = buffer.readUInt8(offset + 4);
    sectors.set(`${x},${y},${z}`, {
      present: buffer.subarray(offset + 5, offset + 5 + bitsetBytes),
      walkable: buffer.subarray(
        offset + 5 + bitsetBytes,
        offset + 5 + bitsetBytes * 2,
      ),
    });
    offset += entrySize;
  }
  return (position) => {
    const sector = sectors.get(
      `${Math.floor(position.x / sectorSize)},${Math.floor(position.y / sectorSize)},${position.z}`,
    );
    if (!sector) return "missing";
    const bit = (position.y % sectorSize) * sectorSize + (position.x % sectorSize);
    if ((sector.present[bit >> 3]! & (1 << (bit & 7))) === 0) return "missing";
    return (sector.walkable[bit >> 3]! & (1 << (bit & 7))) === 0
      ? "blocked"
      : "walkable";
  };
}
