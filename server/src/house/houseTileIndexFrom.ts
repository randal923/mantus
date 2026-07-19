import type { Position } from "@tibia/protocol";
import { positionKey } from "../positionKey";

export interface HouseTileIndex {
  readonly byPosition: ReadonlyMap<string, number>;
  readonly byHouse: ReadonlyMap<number, ReadonlyArray<Position>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Builds the house-tile lookup from the converted map content's
 * `tileMetadata` entries ({position, houseId}). Invalid entries are rejected
 * so a corrupted artifact cannot silently open house tiles to everyone.
 */
export function houseTileIndexFrom(tileMetadata: unknown): HouseTileIndex {
  const byPosition = new Map<string, number>();
  const byHouse = new Map<number, Position[]>();
  if (!Array.isArray(tileMetadata)) return { byPosition, byHouse };
  for (const entry of tileMetadata) {
    if (!isRecord(entry) || !isRecord(entry.position)) continue;
    const houseId = entry.houseId;
    if (!Number.isInteger(houseId) || Number(houseId) < 1) continue;
    const { x, y, z } = entry.position;
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      !Number.isInteger(z) ||
      Number(x) < 0 ||
      Number(y) < 0 ||
      Number(z) < 0 ||
      Number(z) > 15
    ) {
      throw new Error("map content has an invalid house tile position");
    }
    const position = { x: Number(x), y: Number(y), z: Number(z) };
    byPosition.set(positionKey(position), Number(houseId));
    const tiles = byHouse.get(Number(houseId)) ?? [];
    tiles.push(position);
    byHouse.set(Number(houseId), tiles);
  }
  return { byPosition, byHouse };
}
