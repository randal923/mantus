import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { positionKey } from "../positionKey";

const REQUIREMENTS_PATH = fileURLToPath(
  new URL("../../data/door-levels.json", import.meta.url),
);

/**
 * Level-door requirements keyed by position, imported from Canary's otservbr
 * startup tables. Maps other than the one the data was authored for get an
 * empty table, which keeps every level door fail-closed there.
 */
export function loadDoorLevelRequirements(
  mapName: string,
): ReadonlyMap<string, number> {
  const parsed: unknown = JSON.parse(readFileSync(REQUIREMENTS_PATH, "utf8"));
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { formatVersion?: unknown }).formatVersion !== 1
  ) {
    throw new Error("door-levels.json has an unsupported format version");
  }
  const document = parsed as {
    mapName?: unknown;
    requirements?: unknown;
  };
  if (document.mapName !== mapName) return new Map();
  if (!Array.isArray(document.requirements)) {
    throw new Error("door-levels.json has no requirements list");
  }
  const requirements = new Map<string, number>();
  for (const entry of document.requirements) {
    const { x, y, z, level } = entry as Record<string, unknown>;
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      !Number.isInteger(z) ||
      !Number.isInteger(level) ||
      Number(level) <= 0
    ) {
      throw new Error("door-levels.json has an invalid requirement entry");
    }
    requirements.set(
      positionKey({ x: Number(x), y: Number(y), z: Number(z) }),
      Number(level),
    );
  }
  return requirements;
}
