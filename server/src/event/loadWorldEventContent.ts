import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  WorldEventArea,
  WorldEventDefinition,
  WorldEventSpawn,
  WorldEventStage,
} from "./WorldEventDefinition";

const RAIDS_PATH = fileURLToPath(
  new URL("../../data/raids.json", import.meta.url),
);

const WEEKDAYS: ReadonlySet<string> = new Set([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);

function requirePosition(value: unknown, label: string) {
  const { x, y, z } = (value ?? {}) as Record<string, unknown>;
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
    throw new Error(`raids.json ${label} has an invalid position`);
  }
  return { x: Number(x), y: Number(y), z: Number(z) };
}

function requireStages(value: unknown, label: string): WorldEventStage[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`raids.json ${label} has no stages`);
  }
  return value.map((entry) => {
    const stage = entry as Record<string, unknown>;
    const advanceAfterMs = Number(stage.advanceAfterMs ?? 0);
    if (!Number.isFinite(advanceAfterMs) || advanceAfterMs < 0) {
      throw new Error(`raids.json ${label} has an invalid stage delay`);
    }
    if (stage.kind === "announce") {
      const message = stage.message;
      if (typeof message !== "string" || message.length === 0) {
        throw new Error(`raids.json ${label} has an empty announcement`);
      }
      return { kind: "announce", message, advanceAfterMs };
    }
    if (stage.kind !== "spawn" || !Array.isArray(stage.monsters)) {
      throw new Error(`raids.json ${label} has an unknown stage kind`);
    }
    const monsters: WorldEventSpawn[] = stage.monsters.map((monster) => {
      const { name, amount, position } = monster as Record<string, unknown>;
      if (
        typeof name !== "string" ||
        name.length === 0 ||
        !Number.isInteger(amount) ||
        Number(amount) <= 0
      ) {
        throw new Error(`raids.json ${label} has an invalid spawn`);
      }
      return {
        name,
        amount: Number(amount),
        ...(position === undefined
          ? {}
          : { position: requirePosition(position, label) }),
      };
    });
    if (monsters.length === 0) {
      throw new Error(`raids.json ${label} has an empty spawn stage`);
    }
    return { kind: "spawn", monsters, advanceAfterMs };
  });
}

/**
 * Imported world events keyed by id. Maps other than the one the data was
 * authored for get an empty table, so no event ever fires against geometry it
 * was not written for.
 */
export function loadWorldEventContent(
  mapName: string,
): ReadonlyMap<string, WorldEventDefinition> {
  const parsed: unknown = JSON.parse(readFileSync(RAIDS_PATH, "utf8"));
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { formatVersion?: unknown }).formatVersion !== 1
  ) {
    throw new Error("raids.json has an unsupported format version");
  }
  const document = parsed as { mapName?: unknown; raids?: unknown };
  if (document.mapName !== mapName) return new Map();
  if (!Array.isArray(document.raids)) {
    throw new Error("raids.json has no raid list");
  }
  const events = new Map<string, WorldEventDefinition>();
  for (const entry of document.raids) {
    const raid = entry as Record<string, unknown>;
    const id = raid.id;
    if (typeof id !== "string" || id.length === 0 || id.length > 128) {
      throw new Error("raids.json has an invalid raid id");
    }
    if (events.has(id)) throw new Error(`raids.json repeats raid id ${id}`);
    const areas: WorldEventArea[] = (
      Array.isArray(raid.areas) ? raid.areas : []
    ).map((area) => {
      const { from, to } = area as Record<string, unknown>;
      return {
        from: requirePosition(from, id),
        to: requirePosition(to, id),
      };
    });
    if (areas.length === 0) throw new Error(`raids.json raid ${id} has no area`);
    const allowedDays = (
      Array.isArray(raid.allowedDays) ? raid.allowedDays : []
    ).filter((day): day is string => typeof day === "string");
    if (allowedDays.some((day) => !WEEKDAYS.has(day))) {
      throw new Error(`raids.json raid ${id} has an unknown weekday`);
    }
    const targetChancePerDay = Number(raid.targetChancePerDay);
    const maxChancePerCheck = Number(raid.maxChancePerCheck);
    if (
      !Number.isFinite(targetChancePerDay) ||
      targetChancePerDay <= 0 ||
      !Number.isFinite(maxChancePerCheck) ||
      maxChancePerCheck <= 0
    ) {
      throw new Error(`raids.json raid ${id} has an invalid chance`);
    }
    events.set(id, {
      id,
      sourcePath: String(raid.sourcePath ?? ""),
      areas,
      allowedDays,
      minActivePlayers: Math.max(0, Number(raid.minActivePlayers ?? 0)),
      ...(raid.initialChance === undefined
        ? {}
        : { initialChance: Number(raid.initialChance) }),
      targetChancePerDay,
      maxChancePerCheck,
      ...(raid.minGapBetweenMs === undefined
        ? {}
        : { minGapBetweenMs: Number(raid.minGapBetweenMs) }),
      ...(raid.maxChecksPerDay === undefined
        ? {}
        : { maxChecksPerDay: Number(raid.maxChecksPerDay) }),
      stages: requireStages(raid.stages, id),
    });
  }
  return events;
}
