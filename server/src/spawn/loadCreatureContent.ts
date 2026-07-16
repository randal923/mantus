import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  ConditionType,
  CreatureOutfit,
  DamageType,
  Direction,
  Position,
} from "@tibia/protocol";
import type {
  MonsterAbility,
  MonsterLoot,
  MonsterSummon,
  MonsterType,
} from "../creature/MonsterType";
import type { NpcType } from "../creature/NpcType";
import type { CreatureContent } from "./CreatureContent";
import type { SpawnSlotDefinition } from "./SpawnDefinition";

const CONTENT_DIR = fileURLToPath(new URL("../../../content", import.meta.url));
const DIRECTIONS = new Set<Direction>([
  "north",
  "east",
  "south",
  "west",
  "northeast",
  "southeast",
  "southwest",
  "northwest",
]);

export function loadCreatureContent(
  name: string,
  mapName: string,
): CreatureContent {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error("unsafe creature content name");
  const monsters = readDocument(`monsters/${name}-monsters.json`);
  const npcs = readDocument(`npcs/${name}-npcs.json`);
  const spawns = readDocument(`spawns/${name}-spawns.json`);
  if (
    monsters.formatVersion !== 2 ||
    npcs.formatVersion !== 2 ||
    spawns.formatVersion !== 2
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
    manaCost: nonnegativeInteger(type.manaCost, "monster mana cost"),
    changeTarget: parseChangeTarget(type.changeTarget),
    light: parseLight(type.light),
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
      staticAttackChance: boundedInteger(
        flags.staticAttackChance,
        "staticAttackChance",
        0,
        100,
      ),
      healthHidden: bool(flags.healthHidden, "healthHidden"),
    },
    targetStrategy: {
      nearest: nonnegativeInteger(strategy.nearest, "nearest strategy"),
      health: nonnegativeInteger(strategy.health, "health strategy"),
      damage: nonnegativeInteger(strategy.damage, "damage strategy"),
      random: nonnegativeInteger(strategy.random, "random strategy"),
    },
    attacks: parseMonsterAbilities(type.attacks, false),
    defenses: parseMonsterAbilities(type.defenses, true),
    elements: parseElements(type.elements),
    immunities: parseImmunities(type.immunities),
    summons: parseSummons(type.summons),
    voices: primitiveRecords(type.voices, "monster voices"),
    loot: parseLoot(type.loot),
  };
}

function parseChangeTarget(
  value: unknown,
): MonsterType["changeTarget"] {
  const changeTarget = record(value, "monster change target");
  return {
    intervalMs:
      changeTarget.intervalMs === 0
        ? 0
        : boundedInteger(
            changeTarget.intervalMs,
            "monster change target interval",
            250,
            60_000,
          ),
    chance: boundedInteger(
      changeTarget.chance,
      "monster change target chance",
      0,
      100,
    ),
  };
}

function parseLight(value: unknown): MonsterType["light"] {
  const light = record(value, "monster light");
  return {
    intensity: boundedInteger(
      light.intensity,
      "monster light intensity",
      0,
      255,
    ),
    color: boundedInteger(light.color, "monster light color", 0, 255),
  };
}

function parseMonsterAbilities(
  value: unknown,
  defensive: boolean,
): MonsterAbility[] {
  if (!Array.isArray(value)) throw new Error("monster abilities must be an array");
  return value.map((entry) => {
    const ability = record(entry, "monster ability");
    const name = typeof ability.name === "string" ? ability.name : "";
    const intervalMs = boundedInteger(
      ability.interval ?? ability.intervall ?? 2_000,
      "monster ability interval",
      50,
      60_000,
    );
    const chance = Math.min(
      100,
      boundedInteger(
        ability.chance ?? 100,
        "monster ability chance",
        0,
        1_000,
      ),
    );
    const range = boundedInteger(
      ability.range ?? (name === "melee" ? 1 : 0),
      "monster ability range",
      0,
      32,
    );
    const target =
      defensive || (ability.target !== true && range === 0) ? "self" : "target";
    const area = parseArea(ability);
    if (!name && (ability.defense !== undefined || ability.armor !== undefined)) {
      return {
        kind: "stats",
        intervalMs,
        chance,
        target: "self",
        range: 0,
        area: { shape: "single" },
        defense: boundedInteger(
          ability.defense ?? 0,
          "monster defense",
          0,
          100_000,
        ),
        armor: boundedInteger(
          ability.armor ?? 0,
          "monster armor",
          0,
          100_000,
        ),
        mitigation: finiteNumber(
          ability.mitigation ?? 0,
          "monster mitigation",
          0,
          100,
        ),
      };
    }
    if (name === "speed" || name === "haste") {
      const speedChange = boundedInteger(
        Math.abs(Number(ability.speedChange ?? ability.speed ?? 0)),
        "monster speed condition",
        0,
        10_000,
      );
      const paralyze = Number(ability.speedChange ?? 0) < 0;
      return {
        kind: "condition",
        intervalMs,
        chance,
        target: defensive && !paralyze ? "self" : target,
        range,
        area,
        conditionType: paralyze ? "paralyze" : "haste",
        durationMs: boundedInteger(
          ability.duration ?? 5_000,
          "monster condition duration",
          250,
          24 * 60 * 60 * 1000,
        ),
        magnitude: speedChange,
        ...(ability.effect !== undefined ? { effect: primitive(ability.effect) } : {}),
        ...(typeof ability.shootEffect === "string"
          ? { missile: ability.shootEffect }
          : {}),
      };
    }
    if (name === "drunk" || name === "invisible" || name === "outfit") {
      const conditionType = name as ConditionType;
      return {
        kind: "condition",
        intervalMs,
        chance,
        target: defensive || name === "invisible" ? "self" : target,
        range,
        area,
        conditionType,
        durationMs: boundedInteger(
          ability.duration ?? 5_000,
          "monster condition duration",
          250,
          24 * 60 * 60 * 1000,
        ),
        ...(typeof ability.outfitMonster === "string"
          ? { outfitMonsterId: normalizeIdentifier(ability.outfitMonster) }
          : {}),
        ...(ability.outfitItem !== undefined
          ? {
              outfitItemTypeId: boundedInteger(
                ability.outfitItem,
                "monster outfit item",
                1,
                65_535,
              ),
            }
          : {}),
        ...(ability.effect !== undefined ? { effect: primitive(ability.effect) } : {}),
        ...(typeof ability.shootEffect === "string"
          ? { missile: ability.shootEffect }
          : {}),
      };
    }
    const conditionType = conditionTypeFor(ability.type, name);
    if (conditionType) {
      const damageType = damageTypeFor(ability.type) ?? damageTypeForCondition(conditionType);
      const maximum = damageBound(ability.maxDamage ?? ability.minDamage ?? 5);
      return {
        kind: "condition",
        intervalMs,
        chance,
        target,
        range,
        area,
        conditionType,
        durationMs: boundedInteger(
          ability.duration ?? Math.max(5_000, intervalMs * 5),
          "monster condition duration",
          250,
          24 * 60 * 60 * 1000,
        ),
        magnitude: Math.max(1, Math.ceil(maximum / 5)),
        tickIntervalMs: 2_000,
        damageType,
        ...(ability.effect !== undefined ? { effect: primitive(ability.effect) } : {}),
        ...(typeof ability.shootEffect === "string"
          ? { missile: ability.shootEffect }
          : {}),
      };
    }
    const damageType =
      name === "melee" ? "physical" : damageTypeFor(ability.type);
    const healing = damageType === "healing";
    if (
      damageType ||
      ability.minDamage !== undefined ||
      ability.maxDamage !== undefined
    ) {
      const minimum = damageBound(ability.minDamage ?? 0);
      const maximum = damageBound(ability.maxDamage ?? minimum);
      return {
        kind: healing ? "healing" : "damage",
        intervalMs,
        chance,
        target: healing || defensive ? "self" : target,
        range,
        area,
        damageType: damageType ?? "physical",
        minimum: Math.min(minimum, maximum),
        maximum: Math.max(minimum, maximum),
        ...(ability.effect !== undefined ? { effect: primitive(ability.effect) } : {}),
        ...(typeof ability.shootEffect === "string"
          ? { missile: ability.shootEffect }
          : {}),
      };
    }
    return {
      kind: "effect",
      intervalMs,
      chance,
      target,
      range,
      area,
      ...(ability.effect !== undefined ? { effect: primitive(ability.effect) } : {}),
    };
  });
}

function parseArea(ability: Record<string, unknown>): MonsterAbility["area"] {
  if (ability.radius !== undefined) {
    return {
      shape: "circle",
      radius: boundedInteger(ability.radius, "monster ability radius", 0, 16),
    };
  }
  if (ability.length !== undefined || ability.lenght !== undefined) {
    const spread = boundedInteger(
      ability.spread ?? 1,
      "monster ability spread",
      0,
      16,
    );
    return {
      shape: spread > 1 ? "cone" : "beam",
      length: boundedInteger(
        ability.length ?? ability.lenght,
        "monster ability length",
        1,
        16,
      ),
      spread: Math.max(1, spread),
    };
  }
  return { shape: "single" };
}

function parseElements(
  value: unknown,
): Partial<Record<DamageType, number>> {
  const source = record(value, "monster elements");
  const parsed: Partial<Record<DamageType, number>> = {};
  for (const [key, amount] of Object.entries(source)) {
    const damageType = damageTypeFor(key);
    if (!damageType || damageType === "healing") continue;
    parsed[damageType] = finiteNumber(amount, "monster element", -1_000, 1_000);
  }
  return parsed;
}

function parseImmunities(value: unknown): ConditionType[] {
  return stringArray(value, "monster immunities").flatMap((immunity) => {
    if (immunity === "paralyze") return ["paralyze"] as const;
    if (immunity === "invisible") return ["invisible"] as const;
    if (immunity === "outfit") return ["outfit"] as const;
    if (immunity === "bleed") return ["poison"] as const;
    return [];
  });
}

function parseSummons(value: unknown): MonsterSummon[] {
  if (!Array.isArray(value)) throw new Error("monster summons must be an array");
  return value.map((entry) => {
    const summon = record(entry, "monster summon");
    const rawName = summon.name ?? summon.typeId;
    if (typeof rawName !== "string") throw new Error("monster summon has no type");
    return {
      typeId: normalizeIdentifier(rawName),
      intervalMs: boundedInteger(
        summon.interval ?? 2_000,
        "monster summon interval",
        250,
        60_000,
      ),
      chance: boundedInteger(
        summon.chance ?? 100,
        "monster summon chance",
        0,
        100,
      ),
      maxCount: boundedInteger(
        summon.max ?? summon.maxCount ?? 1,
        "monster summon limit",
        1,
        16,
      ),
    };
  });
}

function parseLoot(value: unknown): MonsterLoot[] {
  if (!Array.isArray(value)) throw new Error("monster loot must be an array");
  return value.map((entry) => {
    const loot = record(entry, "monster loot");
    const itemTypeId =
      loot.id === undefined
        ? undefined
        : boundedInteger(loot.id, "monster loot item id", 1, 65_535);
    const itemName =
      loot.name === undefined ? undefined : text(loot.name, "monster loot name");
    if (!itemTypeId && !itemName) throw new Error("monster loot has no item");
    return {
      ...(itemTypeId ? { itemTypeId } : {}),
      ...(itemName ? { itemName } : {}),
      chance: Math.min(
        100_000,
        boundedInteger(
          loot.chance ?? 0,
          "monster loot chance",
          0,
          1_000_000,
        ),
      ),
      maxCount: boundedInteger(
        loot.maxCount ?? 1,
        "monster loot max count",
        1,
        1_000,
      ),
    };
  });
}

function damageTypeFor(value: unknown): DamageType | undefined {
  const key = typeof value === "string" ? value : "";
  const types: Readonly<Record<string, DamageType>> = {
    COMBAT_PHYSICALDAMAGE: "physical",
    COMBAT_ENERGYDAMAGE: "energy",
    COMBAT_EARTHDAMAGE: "earth",
    COMBAT_FIREDAMAGE: "fire",
    COMBAT_LIFEDRAIN: "life-drain",
    COMBAT_LIFEDRAINDAMAGE: "life-drain",
    COMBAT_MANADRAIN: "mana-drain",
    COMBAT_MANADRAINDAMAGE: "mana-drain",
    COMBAT_DROWNDAMAGE: "drown",
    COMBAT_ICEDAMAGE: "ice",
    COMBAT_HOLYDAMAGE: "holy",
    COMBAT_DEATHDAMAGE: "death",
    COMBAT_HEALING: "healing",
  };
  return types[key];
}

function conditionTypeFor(value: unknown, name: string): ConditionType | undefined {
  const key = typeof value === "string" ? value : "";
  if (key === "CONDITION_POISON" || name.includes("poisonfield")) return "poison";
  if (key === "CONDITION_FIRE" || name.includes("firefield")) return "fire";
  if (key === "CONDITION_ENERGY" || name.includes("energyfield")) return "energy";
  if (key === "CONDITION_FREEZING") return "paralyze";
  if (key === "CONDITION_CURSED") return "curse";
  if (key === "CONDITION_BLEEDING") return "bleeding";
  if (key === "CONDITION_DAZZLED") return "dazzled";
  return undefined;
}

function damageTypeForCondition(type: ConditionType): DamageType {
  if (type === "fire") return "fire";
  if (type === "energy") return "energy";
  if (type === "bleeding") return "physical";
  if (type === "curse") return "death";
  if (type === "dazzled") return "holy";
  return "earth";
}

function damageBound(value: unknown): number {
  const amount = Math.abs(Number(value));
  if (!Number.isFinite(amount) || amount > 1_000_000) {
    throw new Error("monster damage is out of range");
  }
  return Math.floor(amount);
}

function finiteNumber(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} is out of range`);
  }
  return parsed;
}

function primitive(value: unknown): string | number {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error("monster visual is invalid");
  }
  return value;
}

function normalizeIdentifier(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!normalized) throw new Error("monster identifier is invalid");
  return normalized;
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
