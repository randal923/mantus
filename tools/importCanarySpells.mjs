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
if (!source || manifest.converters.spells !== 1) {
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
  spells,
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
