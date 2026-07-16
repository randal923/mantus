// Imports spell and rune metadata from a pinned Canary checkout.
// Canary Lua is read as text and is never loaded or executed.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseCanarySpells } from "./parseCanarySpells.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const canaryRoot = process.argv[2] ?? process.env.CANARY_PATH;
if (!canaryRoot) {
  throw new Error(
    "usage: node tools/importCanarySpells.mjs <pinned-canary-checkout>",
  );
}

const manifest = JSON.parse(
  readFileSync(join(repoRoot, "content/source-manifest.json"), "utf8"),
);
const source = manifest.sources.canarySpells;
if (!source || manifest.converters.spells !== 2) {
  throw new Error("source manifest has no supported Canary spell source");
}
const commit = execFileSync("git", ["-C", canaryRoot, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (commit !== source.commit) {
  throw new Error(`Canary checkout is ${commit}, expected ${source.commit}`);
}

const definitions = [
  ...readDefinitions(join(canaryRoot, "data/scripts/spells")),
  ...readDefinitions(join(canaryRoot, "data/scripts/runes")),
];
const constantsSource = readFileSync(
  join(canaryRoot, "src/utils/utils_definitions.hpp"),
  "utf8",
);
const constants = parseConstants(constantsSource);
const areasSource = readFileSync(
  join(canaryRoot, "data/scripts/lib/register_spells.lua"),
  "utf8",
);
const spells = parseCanarySpells(
  definitions,
  constants,
  parseAreas(areasSource),
);
const definitionsSha256 = createHash("sha256")
  .update(
    [
      ...definitions.map(
        (definition) => `${definition.path}\0${definition.source}`,
      ),
      `src/utils/utils_definitions.hpp\0${constantsSource}`,
      `data/scripts/lib/register_spells.lua\0${areasSource}`,
    ].sort().join("\0"),
  )
  .digest("hex");
if (definitionsSha256 !== source.definitionsSha256) {
  throw new Error(
    `Canary spell sources hash ${definitionsSha256} is not pinned`,
  );
}
const report = {
  total: spells.length,
  supported: spells.filter((spell) => spell.supported).length,
  unsupported: spells.filter((spell) => !spell.supported).length,
  reasons: Object.fromEntries(
    [...new Set(spells.flatMap((spell) => spell.unsupportedReasons))]
      .sort()
      .map((reason) => [
        reason,
        spells.filter((spell) => spell.unsupportedReasons.includes(reason))
          .length,
      ]),
  ),
};
const document = {
  formatVersion: manifest.converters.spells,
  source: {
    canaryCommit: commit,
    definitionsSha256,
  },
  report,
  spells: spells.map((spell) => ({
    ...spell,
    parity: spellParity(spell),
  })),
};
const target = join(repoRoot, "content/spells/canary-spells.json");
const staging = `${target}.${process.pid}.tmp`;
mkdirSync(dirname(target), { recursive: true });
rmSync(staging, { force: true });
writeFileSync(staging, `${JSON.stringify(document, null, 2)}\n`);
if (statSync(staging).size === 0) throw new Error("spell catalog is empty");
renameSync(staging, target);
console.log(
  `imported ${report.total} spell and rune definitions (${report.supported} supported)`,
);

function readDefinitions(directory) {
  const definitions = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      definitions.push(...readDefinitions(path));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".lua")) continue;
    definitions.push({
      path: relative(canaryRoot, path).replaceAll("\\", "/"),
      source: readFileSync(path, "utf8"),
    });
  }
  return definitions;
}

function parseConstants(source) {
  const constants = {};
  for (const match of source.matchAll(
    /^\s*(CONST_(?:ME|ANI)_[A-Z0-9_]+)\s*=\s*(\d+)\s*,/gm,
  )) {
    constants[match[1]] = Number(match[2]);
  }
  return constants;
}

function parseAreas(source) {
  const areas = {};
  for (const match of source.matchAll(
    /^(AREA_[A-Z0-9_]+)\s*=\s*{([\s\S]*?)^}/gm,
  )) {
    const rows = [...match[2].matchAll(/{\s*([0-3,\s]+)\s*}/g)].map(
      (row) =>
        row[1]
          .split(",")
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isInteger(value)),
    );
    const centerY = rows.findIndex((row) => row.includes(3));
    const centerX = rows[centerY]?.indexOf(3) ?? -1;
    if (centerX < 0 || centerY < 0) continue;
    areas[match[1]] = rows.flatMap((row, y) =>
      row.flatMap((value, x) =>
        value === 1 || value === 3
          ? [{ x: x - centerX, y: y - centerY }]
          : [],
      ),
    );
  }
  return areas;
}

function spellParity(spell) {
  if (spell.unsupportedReasons.includes("example definition")) {
    return {
      ownerTodo: "07-combat",
      status: "non-content",
      reason:
        "Pinned example file is documentation for content authors and is not a registered gameplay definition.",
    };
  }
  if (spell.supported) {
    return {
      ownerTodo: "07-combat",
      status: "implemented",
      reason:
        "Executable through the project-native authoritative spell registry.",
    };
  }
  const blockedBy = spellDependency(spell.sourcePath);
  return {
    ownerTodo: "07-combat",
    status: "blocked",
    blockedBy,
    reason:
      blockedBy === "07-combat"
        ? `Requires a reviewed TypeScript combat implementation: ${spell.unsupportedReasons.join(", ")}.`
        : `Requires ${blockedBy} before its registered behavior can be enabled: ${spell.unsupportedReasons.join(", ")}.`,
  };
}

function spellDependency(path) {
  if (
    path.includes("/field") ||
    path.includes("_field") ||
    path.includes("_wall") ||
    path.includes("_bomb") ||
    path.endsWith("/magic_wall.lua") ||
    path.endsWith("/wild_growth.lua") ||
    path.endsWith("/destroy_field_rune.lua")
  ) {
    return "08c-decay";
  }
  if (path.includes("/party/")) return "13a-parties";
  if (path.includes("/house/")) return "13d-houses";
  if (path.includes("/familiar/") || path.includes("/avatar_")) {
    return "14-optional-features";
  }
  if (
    path.endsWith("/find_person.lua") ||
    path.endsWith("/find_fiend.lua")
  ) {
    return "13e-social-services";
  }
  if (
    path.endsWith("/levitate.lua") ||
    path.endsWith("/magic_rope.lua")
  ) {
    return "12b-world-actions";
  }
  return "07-combat";
}
