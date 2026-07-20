// Imports bestiary/bosstiary metadata for our monster catalog from a pinned
// Canary checkout. Monsters sharing a Canary race id (e.g. butterfly colors)
// are merged into one entry crediting kills from any of them.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseCanaryBestiary } from "./parseCanaryBestiary.mjs";

const repoRoot = join(import.meta.dirname, "..");
const canaryRoot =
  process.argv.find((argument, index) => index >= 2 && !argument.startsWith("--")) ??
  process.env.CANARY_PATH;
if (!canaryRoot) {
  throw new Error("usage: node tools/importCanaryBestiary.mjs <pinned-canary-checkout>");
}

const manifest = JSON.parse(
  readFileSync(join(repoRoot, "content/source-manifest.json"), "utf8"),
);
const commit = execFileSync("git", ["-C", canaryRoot, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (commit !== manifest.canary.commit) {
  throw new Error(`Canary checkout is ${commit}, expected ${manifest.canary.commit}`);
}

const monsterIdsByName = new Map();
for (const contentFile of ["world-monsters.json", "starter-monsters.json"]) {
  const catalog = JSON.parse(
    readFileSync(join(repoRoot, "content/monsters", contentFile), "utf8"),
  );
  for (const type of catalog.types) {
    const known = monsterIdsByName.get(type.name.toLowerCase()) ?? new Set();
    known.add(type.id);
    monsterIdsByName.set(type.name.toLowerCase(), known);
  }
}

const monsterDir = join(canaryRoot, "data-otservbr-global/monster");
const files = [];
collectLuaFiles(monsterDir, files);
files.sort();

const digest = createHash("sha256");
const bestiaryByRaceId = new Map();
const bosstiaryByRaceId = new Map();
const warnings = [];
let matchedFiles = 0;

for (const path of files) {
  const source = readFileSync(path, "utf8");
  const sourcePath = relative(monsterDir, path);
  const parsed = parseCanaryBestiary(source, sourcePath);
  if (!parsed.name || (!parsed.bestiary && !parsed.bosstiary)) {
    continue;
  }
  const monsterIds = monsterIdsByName.get(parsed.name.toLowerCase());
  if (!monsterIds) {
    continue;
  }
  warnings.push(...parsed.warnings);
  matchedFiles += 1;
  digest.update(`${sourcePath}\n${source}`);
  if (parsed.bestiary) {
    mergeEntry(bestiaryByRaceId, parsed.bestiary, monsterIds, sourcePath);
  }
  if (parsed.bosstiary) {
    mergeEntry(bosstiaryByRaceId, parsed.bosstiary, monsterIds, sourcePath);
  }
}

for (const raceId of bestiaryByRaceId.keys()) {
  if (bosstiaryByRaceId.has(raceId)) {
    throw new Error(`race id ${raceId} appears in both bestiary and bosstiary`);
  }
}

const output = {
  formatVersion: 1,
  source: {
    canaryCommit: commit,
    definitionsSha256: digest.digest("hex"),
  },
  bestiary: [...bestiaryByRaceId.values()].sort((a, b) => a.raceId - b.raceId),
  bosstiary: [...bosstiaryByRaceId.values()].sort((a, b) => a.raceId - b.raceId),
};
const outputPath = join(repoRoot, "content/monsters/bestiary.json");
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
if (statSync(outputPath).size === 0) {
  throw new Error(`failed to write ${outputPath}`);
}

for (const warning of warnings) {
  console.warn(`warning: ${warning}`);
}
console.log(
  `bestiary entries: ${output.bestiary.length}, bosstiary entries: ${output.bosstiary.length}, matched files: ${matchedFiles}`,
);

function mergeEntry(entriesByRaceId, entry, monsterIds, sourcePath) {
  const existing = entriesByRaceId.get(entry.raceId);
  if (!existing) {
    entriesByRaceId.set(entry.raceId, {
      ...entry,
      monsterIds: [...monsterIds].sort(),
    });
    return;
  }
  for (const key of Object.keys(entry)) {
    if (existing[key] !== entry[key]) {
      throw new Error(
        `race id ${entry.raceId} has conflicting ${key} in ${sourcePath}`,
      );
    }
  }
  existing.monsterIds = [...new Set([...existing.monsterIds, ...monsterIds])].sort();
}

function collectLuaFiles(directory, into) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectLuaFiles(path, into);
    } else if (entry.name.endsWith(".lua")) {
      into.push(path);
    }
  }
}
