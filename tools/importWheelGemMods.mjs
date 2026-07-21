// Generates protocol/src/gemAtelierMods.ts from otclient-mehah's Wheel of
// Destiny mod tables (modules/game_wheel/classes/icons.lua). The ids match
// Canary's WheelGemBasicModifier_t / WheelGemSupremeModifier_t values and
// double as sprite-sheet indices (basic: x = id * 30, supreme: x = id * 35).
//
// Usage: node tools/importWheelGemMods.mjs [path/to/icons.lua]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const iconsPath =
  process.argv[2] ??
  path.join(here, "../../otclient-mehah/modules/game_wheel/classes/icons.lua");
const outPath = path.join(here, "../protocol/src/gemAtelierMods.ts");

const source = readFileSync(iconsPath, "utf8");

function extractTable(name) {
  const start = source.indexOf(`${name} = {`);
  if (start < 0) throw new Error(`table ${name} not found`);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`table ${name} not terminated`);
}

function parseEntries(tableSource) {
  const entries = [];
  const entryRe = /\[(\d+)\]\s*=\s*\{([^{}]*)\}/g;
  for (const match of tableSource.matchAll(entryRe)) {
    const id = Number(match[1]);
    const body = match[2];
    const fields = {};
    for (const field of body.matchAll(/(\w+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|(-?[\d.]+)|(true|false))/g)) {
      const [, key, str, num, bool] = field;
      fields[key] =
        str !== undefined
          ? str.replace(/\\n/g, "\n")
          : bool !== undefined
            ? bool === "true"
            : Number(num);
    }
    entries.push({ id, ...fields });
  }
  return entries;
}

const RESIST_ELEMENTS = {
  Physical: "physical",
  Holy: "holy",
  Death: "death",
  Fire: "fire",
  Earth: "earth",
  Ice: "ice",
  Energy: "energy",
  "Mana Drain": "mana-drain",
  "Life Drain": "life-drain",
};

const STAT_KINDS = { health: "health", mana: "mana", capacity: "capacity" };

function basicEffects(entry) {
  const lines = entry.tooltip.split("\n");
  const effects = [];
  for (const [index, line] of lines.entries()) {
    const resist = line.match(/^([+-])(%s|[\d.]+)%% (.+) Resistance$/);
    if (resist) {
      const [, sign, value, elementName] = resist;
      const element = RESIST_ELEMENTS[elementName];
      if (!element) throw new Error(`unknown element in mod ${entry.id}: ${line}`);
      const scales = value === "%s";
      const magnitude = scales
        ? index === 0
          ? entry.baseI
          : entry.baseII
        : Number(value);
      effects.push({
        kind: "resistance",
        element,
        percent: sign === "-" ? -magnitude : magnitude,
        scalesWithGrade: scales && magnitude > 0,
      });
      continue;
    }
    if (/^\+%s%% Mitigation Multiplier$/.test(line)) {
      effects.push({ kind: "mitigation", percent: entry.baseI });
      continue;
    }
    const stat = line.match(/^\+%s (Hit Points|Health|Mana|Capacity)$/);
    if (stat) {
      const kind = STAT_KINDS[entry.stepTypeI];
      if (!kind) throw new Error(`mod ${entry.id} has stat line without stepTypeI`);
      effects.push({ kind: "stat", stat: kind, step: entry.baseStepI });
      continue;
    }
    throw new Error(`unparsed tooltip line in mod ${entry.id}: ${line}`);
  }
  return effects;
}

const VOCATION_KEYS = { 8: "Knight", 7: "Paladin", 5: "Sorcerer", 6: "Druid", 9: "Monk" };
const DOMAIN_NAMES = ["green", "red", "blue", "purple"];

function supremeEffect(entry, vocations) {
  if (entry.domain !== undefined) {
    return {
      kind: "revelation",
      domain: DOMAIN_NAMES[entry.domain],
      points: entry.baseI,
    };
  }
  if (vocations === "all") {
    const flat = {
      0: { kind: "dodge", percent: entry.baseI },
      1: { kind: "critical-damage", percent: entry.baseI },
      2: { kind: "life-leech", percent: entry.baseI },
      3: { kind: "mana-leech", percent: entry.baseI },
    }[entry.id];
    if (flat) return flat;
  }
  return {
    kind: "spell",
    baseI: entry.baseI,
    baseII: entry.baseII,
    momentum: entry.type === "cooldown",
  };
}

const basic = parseEntries(extractTable("BasicMods")).map((entry) => ({
  id: entry.id,
  tooltip: entry.tooltip,
  effects: basicEffects(entry),
}));

const flat = parseEntries(extractTable("FlatSupremeMods"));
const vocationTable = extractTable("VocationSupremeMods");
const supreme = [];
for (const entry of flat) {
  const vocations = entry.id === 4 ? ["Sorcerer", "Druid"] : "all";
  supreme.push({
    id: entry.id,
    name: entry.desc,
    tooltip: entry.tooltip,
    vocations,
    effect: supremeEffect(entry, vocations),
  });
}
for (const block of vocationTable.matchAll(/\[(\d+)\]\s*=\s*\{([\s\S]*?)\n\t\}/g)) {
  const vocation = VOCATION_KEYS[Number(block[1])];
  if (!vocation) throw new Error(`unknown vocation key ${block[1]}`);
  for (const entry of parseEntries(block[2])) {
    supreme.push({
      id: entry.id,
      name: entry.desc,
      tooltip: entry.tooltip,
      vocations: [vocation],
      effect: supremeEffect(entry, [vocation]),
    });
  }
}
supreme.sort((a, b) => a.id - b.id);

if (basic.length !== 46) throw new Error(`expected 46 basic mods, got ${basic.length}`);
if (supreme.length !== 94) throw new Error(`expected 94 supreme mods, got ${supreme.length}`);

const render = (value) =>
  JSON.stringify(value, null, 2).replace(/"(\w[\w-]*)":/g, (m, key) =>
    /^[a-zA-Z_]\w*$/.test(key) ? `${key}:` : m,
  );

const output = `// Generated by tools/importWheelGemMods.mjs from otclient-mehah's
// modules/game_wheel/classes/icons.lua — do not edit by hand.
// Mod ids match Canary's WheelGemBasicModifier_t / WheelGemSupremeModifier_t
// enum values and index the icon sprite sheets (basic: x = id * 30 in
// icons-skillwheel-basicmods.png, supreme: x = id * 35 in
// icons-skillwheel-suprememods.png).
import type {
  GemBasicModDefinition,
  GemSupremeModDefinition,
} from "./gemAtelier";

export const GEM_BASIC_MODS: ReadonlyArray<GemBasicModDefinition> = ${render(basic)};

export const GEM_SUPREME_MODS: ReadonlyArray<GemSupremeModDefinition> = ${render(supreme)};
`;

writeFileSync(outPath, output);
console.log(
  `wrote ${outPath}: ${basic.length} basic mods, ${supreme.length} supreme mods`,
);
