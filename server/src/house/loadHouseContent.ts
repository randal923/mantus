import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { positionSchema } from "@tibia/protocol";
import type { HouseInfo } from "./HouseInfo";

const HOUSES_PATH = fileURLToPath(
  new URL("../../data/houses.json", import.meta.url),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedInteger(value: unknown, max: number): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > max) {
    throw new Error("houses.json contains an out-of-range number");
  }
  return Number(value);
}

/**
 * Loads the generated house metadata for the named map. Maps without a
 * matching artifact get an empty catalog, so every house interaction fails
 * closed rather than trusting unpinned data.
 */
export function loadHouseContent(mapName: string): ReadonlyMap<number, HouseInfo> {
  const houses = new Map<number, HouseInfo>();
  let raw: string;
  try {
    raw = readFileSync(HOUSES_PATH, "utf8");
  } catch {
    return houses;
  }
  const parsed: unknown = JSON.parse(raw);
  if (
    !isRecord(parsed) ||
    parsed.formatVersion !== 1 ||
    parsed.mapName !== mapName ||
    !Array.isArray(parsed.houses)
  ) {
    return houses;
  }
  for (const entry of parsed.houses) {
    if (!isRecord(entry) || typeof entry.name !== "string" || !entry.name) {
      throw new Error("houses.json contains an invalid house entry");
    }
    const houseId = boundedInteger(entry.houseId, 1_000_000);
    const position = positionSchema.safeParse(entry.entry);
    if (houseId < 1 || !position.success || houses.has(houseId)) {
      throw new Error(`houses.json entry ${houseId} is invalid`);
    }
    houses.set(houseId, {
      houseId,
      name: entry.name.slice(0, 100),
      entry: position.data,
      rent: boundedInteger(entry.rent, 1_000_000_000_000),
      townId: boundedInteger(entry.townId, 65_535),
      size: Math.max(1, boundedInteger(entry.size, 100_000)),
      guildhall: entry.guildhall === true,
      beds: boundedInteger(entry.beds, 100),
    });
  }
  return houses;
}
