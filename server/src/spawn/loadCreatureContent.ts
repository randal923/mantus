import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CreatureOutfit, Direction, Position } from "@tibia/protocol";
import type { MonsterType } from "../creature/MonsterType";
import type { NpcType } from "../creature/NpcType";
import type { CreatureContent } from "./CreatureContent";
import type { SpawnSlotDefinition } from "./SpawnDefinition";

const CONTENT_DIR = fileURLToPath(new URL("../../../content", import.meta.url));
const DIRECTIONS = new Set<Direction>(["north", "east", "south", "west"]);

export function loadCreatureContent(
  name: string,
  mapName: string,
): CreatureContent {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error("unsafe creature content name");
  const monsters = readDocument(`monsters/${name}-monsters.json`);
  const npcs = readDocument(`npcs/${name}-npcs.json`);
  const spawns = readDocument(`spawns/${name}-spawns.json`);
  if (
    monsters.formatVersion !== 1 ||
    npcs.formatVersion !== 1 ||
    spawns.formatVersion !== 1
  ) {
    throw new Error(`${name} creature content has an unsupported version`);
  }
  if (
    JSON.stringify(monsters.source) !== JSON.stringify(npcs.source) ||
    JSON.stringify(monsters.source) !== JSON.stringify(spawns.source)
  ) {
    throw new Error(`${name} creature documents have mismatched sources`);
  }
  if (spawns.map !== mapName) {
    throw new Error(`${name} creature content is for ${String(spawns.map)}, not ${mapName}`);
  }
  if (!Array.isArray(monsters.types) || !Array.isArray(npcs.types)) {
    throw new Error(`${name} creature type lists are invalid`);
  }
  const monsterTypes = new Map<string, MonsterType>();
  for (const value of monsters.types) {
    const type = parseMonsterType(value);
    if (monsterTypes.has(type.id)) throw new Error(`duplicate monster type ${type.id}`);
    monsterTypes.set(type.id, type);
  }
  const npcTypes = new Map<string, NpcType>();
  for (const value of npcs.types) {
    const type = parseNpcType(value);
    if (npcTypes.has(type.id)) throw new Error(`duplicate NPC type ${type.id}`);
    npcTypes.set(type.id, type);
  }
  if (!Array.isArray(spawns.slots)) throw new Error(`${name} spawn list is invalid`);
  const slotIds = new Set<string>();
  const slots = spawns.slots.map((value) => {
    const slot = parseSpawnSlot(value);
    if (slotIds.has(slot.id)) throw new Error(`duplicate spawn slot ${slot.id}`);
    slotIds.add(slot.id);
    const known = slot.kind === "monster"
      ? monsterTypes.has(slot.typeId)
      : npcTypes.has(slot.typeId);
    if (!known) throw new Error(`${slot.id} references unknown type ${slot.typeId}`);
    return slot;
  });
  return { monsterTypes, npcTypes, slots };
}

function readDocument(relativePath: string): Record<string, unknown> {
  const value = JSON.parse(readFileSync(`${CONTENT_DIR}/${relativePath}`, "utf8"));
  if (!isRecord(value)) throw new Error(`${relativePath} is not an object`);
  return value;
}

function parseMonsterType(value: unknown): MonsterType {
  const type = record(value, "monster type");
  const flags = record(type.flags, "monster flags");
  const strategy = record(type.targetStrategy, "monster target strategy");
  const health = positiveInteger(type.health, "monster health");
  const maxHealth = positiveInteger(type.maxHealth, "monster maxHealth");
  if (health > maxHealth) throw new Error("monster health exceeds maxHealth");
  return {
    id: identifier(type.id, "monster id"),
    name: text(type.name, "monster name"),
    description: text(type.description, "monster description"),
    outfit: parseOutfit(type.outfit),
    health,
    maxHealth,
    speed: nonnegativeInteger(type.speed, "monster speed"),
    experience: nonnegativeInteger(type.experience, "monster experience"),
    corpseItemTypeId: nonnegativeInteger(type.corpseItemTypeId, "monster corpse"),
    flags: {
      attackable: bool(flags.attackable, "attackable"),
      hostile: bool(flags.hostile, "hostile"),
      pushable: bool(flags.pushable, "pushable"),
      summonable: bool(flags.summonable, "summonable"),
      convinceable: bool(flags.convinceable, "convinceable"),
      illusionable: bool(flags.illusionable, "illusionable"),
      canPushItems: bool(flags.canPushItems, "canPushItems"),
      canPushCreatures: bool(flags.canPushCreatures, "canPushCreatures"),
      targetDistance: nonnegativeInteger(flags.targetDistance, "targetDistance"),
      runHealth: nonnegativeInteger(flags.runHealth, "runHealth"),
    },
    targetStrategy: {
      nearest: nonnegativeInteger(strategy.nearest, "nearest strategy"),
      health: nonnegativeInteger(strategy.health, "health strategy"),
      damage: nonnegativeInteger(strategy.damage, "damage strategy"),
      random: nonnegativeInteger(strategy.random, "random strategy"),
    },
    attacks: primitiveRecords(type.attacks, "monster attacks"),
    defenses: primitiveRecords(type.defenses, "monster defenses"),
    elements: numberRecord(type.elements, "monster elements"),
    immunities: stringArray(type.immunities, "monster immunities"),
    summons: primitiveRecords(type.summons, "monster summons"),
    voices: primitiveRecords(type.voices, "monster voices"),
    loot: primitiveRecords(type.loot, "monster loot"),
  };
}

function parseNpcType(value: unknown): NpcType {
  const type = record(value, "NPC type");
  const health = positiveInteger(type.health, "NPC health");
  const maxHealth = positiveInteger(type.maxHealth, "NPC maxHealth");
  if (health > maxHealth) throw new Error("NPC health exceeds maxHealth");
  return {
    id: identifier(type.id, "NPC id"),
    name: text(type.name, "NPC name"),
    outfit: parseOutfit(type.outfit),
    health,
    maxHealth,
    speed: positiveInteger(type.speed, "NPC speed"),
    walkIntervalMs: nonnegativeInteger(type.walkIntervalMs, "NPC walk interval"),
    walkRadius: nonnegativeInteger(type.walkRadius, "NPC walk radius"),
  };
}

function parseSpawnSlot(value: unknown): SpawnSlotDefinition {
  const slot = record(value, "spawn slot");
  if (slot.kind !== "monster" && slot.kind !== "npc") {
    throw new Error("spawn slot has an invalid kind");
  }
  if (typeof slot.direction !== "string" || !DIRECTIONS.has(slot.direction as Direction)) {
    throw new Error("spawn slot has an invalid direction");
  }
  return {
    id: text(slot.id, "spawn id"),
    kind: slot.kind,
    typeId: identifier(slot.typeId, "spawn type id"),
    home: parsePosition(slot.home),
    radius: boundedInteger(slot.radius, "spawn radius", 0, 256),
    respawnMs: boundedInteger(
      slot.respawnMs,
      "spawn respawnMs",
      1,
      7 * 24 * 60 * 60 * 1000,
    ),
    direction: slot.direction as Direction,
    enabled: bool(slot.enabled, "spawn enabled"),
  };
}

function parseOutfit(value: unknown): CreatureOutfit {
  const outfit = record(value, "creature outfit");
  const parsed: CreatureOutfit = {
    lookType: boundedInteger(outfit.lookType, "lookType", 0, 65_535),
    head: boundedInteger(outfit.head, "outfit head", 0, 132),
    body: boundedInteger(outfit.body, "outfit body", 0, 132),
    legs: boundedInteger(outfit.legs, "outfit legs", 0, 132),
    feet: boundedInteger(outfit.feet, "outfit feet", 0, 132),
    addons: boundedInteger(outfit.addons, "outfit addons", 0, 3),
  };
  if (outfit.lookTypeEx !== undefined) {
    parsed.lookTypeEx = boundedInteger(
      outfit.lookTypeEx,
      "lookTypeEx",
      1,
      65_535,
    );
  }
  return parsed;
}

function parsePosition(value: unknown): Position {
  const position = record(value, "spawn position");
  return {
    x: boundedInteger(position.x, "position x", 0, 65_535),
    y: boundedInteger(position.y, "position y", 0, 65_535),
    z: boundedInteger(position.z, "position z", 0, 15),
  };
}

function primitiveRecords(
  value: unknown,
  label: string,
): ReadonlyArray<Readonly<Record<string, string | number | boolean>>> {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry) => {
    const source = record(entry, label);
    const parsed: Record<string, string | number | boolean> = {};
    for (const [key, primitive] of Object.entries(source)) {
      if (!["string", "number", "boolean"].includes(typeof primitive)) {
        throw new Error(`${label} contains a non-primitive value`);
      }
      parsed[key] = primitive as string | number | boolean;
    }
    return parsed;
  });
}

function numberRecord(value: unknown, label: string): Readonly<Record<string, number>> {
  const source = record(value, label);
  const parsed: Record<string, number> = {};
  for (const [key, number] of Object.entries(source)) {
    if (typeof number !== "number" || !Number.isFinite(number)) {
      throw new Error(`${label} contains a non-number`);
    }
    parsed[key] = number;
  }
  return parsed;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be a string array`);
  }
  return value;
}

function identifier(value: unknown, label: string): string {
  const parsed = text(value, label);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parsed)) {
    throw new Error(`${label} is invalid`);
  }
  return parsed;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 192) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  return boundedInteger(value, label, 1, Number.MAX_SAFE_INTEGER);
}

function nonnegativeInteger(value: unknown, label: string): number {
  return boundedInteger(value, label, 0, Number.MAX_SAFE_INTEGER);
}

function boundedInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return Number(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
