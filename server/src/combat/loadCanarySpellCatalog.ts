import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AREA_SHAPES,
  CHARACTER_VOCATIONS,
  CONDITION_TYPES,
  DAMAGE_TYPES,
} from "@tibia/protocol";
import type {
  SpellDefinition,
  SpellExpression,
  SpellFormula,
} from "./Spell";

const CATALOG_PATH = fileURLToPath(
  new URL("../../../content/spells/canary-spells.json", import.meta.url),
);
const EXPECTED_COMMIT = "a879c9312e34381e8eedf397b8ed44510698b689";
const EXPECTED_DEFINITIONS_SHA256 =
  "835255c876350bd56f5853005f3e3888074e3f71b345ebd6b0a4312142a8546d";

export function loadCanarySpellCatalog(): ReadonlyArray<SpellDefinition> {
  const value: unknown = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  if (
    !isRecord(value) ||
    value.formatVersion !== 1 ||
    !isRecord(value.source) ||
    value.source.canaryCommit !== EXPECTED_COMMIT ||
    value.source.definitionsSha256 !== EXPECTED_DEFINITIONS_SHA256 ||
    !Array.isArray(value.spells)
  ) {
    throw new Error("Canary spell catalog has invalid provenance");
  }
  return value.spells
    .filter(
      (spell): spell is Record<string, unknown> =>
        isRecord(spell) && spell.supported === true,
    )
    .map(parseSpell);
}

function parseSpell(value: Record<string, unknown>): SpellDefinition {
  const combat = value.combat;
  if (
    typeof value.id !== "string" ||
    value.id.length < 1 ||
    value.id.length > 96 ||
    typeof value.sourcePath !== "string" ||
    typeof value.name !== "string" ||
    (value.words !== null && typeof value.words !== "string") ||
    (value.origin !== "spell" && value.origin !== "rune") ||
    !Array.isArray(value.vocations) ||
    !value.vocations.every((vocation) =>
      CHARACTER_VOCATIONS.includes(
        vocation as (typeof CHARACTER_VOCATIONS)[number],
      )
    ) ||
    !Array.isArray(value.groups) ||
    !value.groups.every(
      (group) => typeof group === "string" && group.length > 0,
    ) ||
    !Array.isArray(value.groupCooldownMs) ||
    !isRecord(combat)
  ) {
    throw new Error(`Canary spell ${String(value.id)} has invalid metadata`);
  }
  const damageType = combat.damageType;
  const dispel = combat.dispel;
  const area = combat.area;
  if (
    !DAMAGE_TYPES.includes(damageType as (typeof DAMAGE_TYPES)[number]) ||
    !isRecord(area) ||
    !AREA_SHAPES.includes(area.shape as (typeof AREA_SHAPES)[number]) ||
    (dispel !== null &&
      !CONDITION_TYPES.includes(dispel as (typeof CONDITION_TYPES)[number]))
  ) {
    throw new Error(`Canary spell ${value.id} has invalid combat metadata`);
  }
  const formula = parseFormula(combat.formula, value.id);
  const numericFields = [
    value.requiredLevel,
    value.requiredMagicLevel,
    value.manaCost,
    value.soulCost,
    value.cooldownMs,
    value.range,
    combat.effectId,
  ];
  if (
    numericFields.some(
      (field) => !Number.isInteger(field) || Number(field) < 0,
    ) ||
    !value.groupCooldownMs.every(
      (field) => Number.isInteger(field) && Number(field) >= 0,
    ) ||
    value.groupCooldownMs.length !== value.groups.length ||
    typeof value.lineOfSight !== "boolean" ||
    typeof value.aggressive !== "boolean" ||
    typeof value.needWeapon !== "boolean" ||
    typeof combat.blockArmor !== "boolean" ||
    typeof combat.blockShield !== "boolean"
  ) {
    throw new Error(`Canary spell ${value.id} has invalid numeric metadata`);
  }
  return {
    id: value.id,
    numericId: nullableInteger(value.numericId),
    sourcePath: value.sourcePath,
    name: value.name,
    words: value.words,
    origin: value.origin,
    runeItemTypeId: nullableInteger(value.runeItemTypeId),
    charges: nullableInteger(value.charges),
    vocations: value.vocations as SpellDefinition["vocations"],
    requiredLevel: value.requiredLevel as number,
    requiredMagicLevel: value.requiredMagicLevel as number,
    manaCost: value.manaCost as number,
    soulCost: value.soulCost as number,
    groups: value.groups as ReadonlyArray<string>,
    cooldownMs: value.cooldownMs as number,
    groupCooldownMs: value.groupCooldownMs as ReadonlyArray<number>,
    range: value.range as number,
    lineOfSight: value.lineOfSight,
    targetKind: parseTargetKind(value.targetKind, value.id),
    aggressive: value.aggressive,
    needWeapon: value.needWeapon,
    damageType: damageType as SpellDefinition["damageType"],
    formula,
    effectId: combat.effectId as number,
    missileId: nullableInteger(combat.missileId),
    blockArmor: combat.blockArmor,
    blockShield: combat.blockShield,
    area: parseArea(area, value.id),
    dispel: dispel as SpellDefinition["dispel"],
  };
}

function parseFormula(value: unknown, id: unknown): SpellFormula {
  if (
    !isRecord(value) ||
    !["fixed", "level-magic", "skill"].includes(String(value.kind))
  ) {
    throw new Error(`Canary spell ${String(id)} has invalid formula`);
  }
  return {
    kind: value.kind as SpellFormula["kind"],
    minimum: parseExpression(value.minimum, id),
    maximum: parseExpression(value.maximum, id),
  };
}

function parseExpression(value: unknown, id: unknown): SpellExpression {
  if (!isRecord(value)) {
    throw new Error(`Canary spell ${String(id)} has invalid expression`);
  }
  if (
    value.type === "number" &&
    typeof value.value === "number" &&
    Number.isFinite(value.value)
  ) {
    return { type: "number", value: value.value };
  }
  if (
    value.type === "variable" &&
    ["level", "magicLevel", "skill", "attack"].includes(String(value.name))
  ) {
    return {
      type: "variable",
      name: value.name as Extract<
        SpellExpression,
        { type: "variable" }
      >["name"],
    };
  }
  if (
    value.type === "binary" &&
    ["add", "subtract", "multiply", "divide"].includes(String(value.operator))
  ) {
    return {
      type: "binary",
      operator: value.operator as Extract<
        SpellExpression,
        { type: "binary" }
      >["operator"],
      left: parseExpression(value.left, id),
      right: parseExpression(value.right, id),
    };
  }
  throw new Error(`Canary spell ${String(id)} has invalid expression`);
}

function parseTargetKind(
  value: unknown,
  id: unknown,
): SpellDefinition["targetKind"] {
  if (
    value === "self" ||
    value === "target" ||
    value === "target-or-direction" ||
    value === "direction" ||
    value === "position"
  ) {
    return value;
  }
  throw new Error(`Canary spell ${String(id)} has invalid target kind`);
}

function parseArea(
  value: Record<string, unknown>,
  id: unknown,
): SpellDefinition["area"] {
  const shape = value.shape as SpellDefinition["area"]["shape"];
  if (shape === "tiles") {
    if (
      !Array.isArray(value.offsets) ||
      value.offsets.length < 1 ||
      value.offsets.length > 512 ||
      typeof value.directional !== "boolean"
    ) {
      throw new Error(`Canary spell ${String(id)} has invalid tile area`);
    }
    const offsets = value.offsets.map((offset) => {
      if (
        !isRecord(offset) ||
        !Number.isInteger(offset.x) ||
        !Number.isInteger(offset.y) ||
        Math.abs(Number(offset.x)) > 32 ||
        Math.abs(Number(offset.y)) > 32
      ) {
        throw new Error(`Canary spell ${String(id)} has invalid tile offset`);
      }
      return { x: offset.x as number, y: offset.y as number };
    });
    return { shape, offsets, directional: value.directional };
  }
  for (const field of ["radius", "length", "spread"] as const) {
    if (
      value[field] !== undefined &&
      (!Number.isInteger(value[field]) ||
        Number(value[field]) < 0 ||
        Number(value[field]) > 32)
    ) {
      throw new Error(`Canary spell ${String(id)} has invalid ${field}`);
    }
  }
  return {
    shape,
    ...(value.radius !== undefined
      ? { radius: value.radius as number }
      : {}),
    ...(value.length !== undefined
      ? { length: value.length as number }
      : {}),
    ...(value.spread !== undefined
      ? { spread: value.spread as number }
      : {}),
  };
}

function nullableInteger(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error("Canary spell catalog has an invalid nullable integer");
  }
  return value as number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
