import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { positionKey } from "../positionKey";

const DOOR_KEYS_PATH = fileURLToPath(
  new URL("../../data/door-keys.json", import.meta.url),
);

/**
 * Key-door action ids keyed by position, imported from Canary's otservbr
 * startup tables. Maps other than the one the data was authored for get an
 * empty table, which keeps every key door fail-closed there.
 */
export function loadDoorKeyActions(
  mapName: string,
): ReadonlyMap<string, number> {
  const parsed: unknown = JSON.parse(readFileSync(DOOR_KEYS_PATH, "utf8"));
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { formatVersion?: unknown }).formatVersion !== 1
  ) {
    throw new Error("door-keys.json has an unsupported format version");
  }
  const document = parsed as { mapName?: unknown; doors?: unknown };
  if (document.mapName !== mapName) return new Map();
  if (!Array.isArray(document.doors)) {
    throw new Error("door-keys.json has no doors list");
  }
  const actions = new Map<string, number>();
  for (const door of document.doors) {
    const { actionId, itemId, positions } = door as Record<string, unknown>;
    if (
      !Number.isInteger(actionId) ||
      Number(actionId) <= 0 ||
      (itemId !== null && !Number.isInteger(itemId)) ||
      !Array.isArray(positions) ||
      positions.length === 0
    ) {
      throw new Error("door-keys.json has an invalid door entry");
    }
    for (const position of positions) {
      const { x, y, z } = position as Record<string, unknown>;
      if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
        throw new Error("door-keys.json has an invalid door position");
      }
      actions.set(
        positionKey({ x: Number(x), y: Number(y), z: Number(z) }),
        Number(actionId),
      );
    }
  }
  return actions;
}
