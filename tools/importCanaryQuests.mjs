// Imports the quest-log catalog and the storage alias map from a pinned
// Canary checkout into content/quests/ (Features 103-105). Canary Lua is
// read as text and never executed. Quest ids are the 1-based position in
// catalog/init.lua, exactly how Canary's catalog.lua indexes its Quests
// table; storage keys use the content convention (dotted, no `Storage.`
// root), matching the NPC dialogue import.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  parseCanaryQuestModule,
  parseCatalogInit,
  parseLuaStorageTable,
} from "./parseCanaryQuestCatalog.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const canaryRoot = process.argv[2] ?? process.env.CANARY_PATH;
if (!canaryRoot) {
  throw new Error(
    "usage: node tools/importCanaryQuests.mjs <pinned-canary-checkout>",
  );
}

const EXPECTED_MODULE_COUNT = 51;
// 457 textual `missionId =` hits minus the commented-out placeholder in
// 031_tibia_tales.lua:303.
const EXPECTED_MISSION_COUNT = 456;
const EXPECTED_SCRIPT_DIR_COUNT = 114;
const CATALOG_DIR = "data-otservbr-global/lib/core/quests/catalog";
const SCRIPTS_DIR = "data-otservbr-global/scripts/quests";

const manifest = JSON.parse(
  await readFile(join(repoRoot, "content/source-manifest.json"), "utf8"),
);
if (manifest.converters.quests !== 1) {
  throw new Error("manifest converters.quests is not version 1");
}
const commit = execFileSync("git", ["-C", canaryRoot, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (commit !== manifest.canary.commit) {
  throw new Error(
    `Canary checkout is ${commit}, expected ${manifest.canary.commit}`,
  );
}

const storagesSource = manifest.sources.canaryStorages;
const storagesLua = await readFile(
  join(canaryRoot, storagesSource.path),
  "utf8",
);
const storagesSha = createHash("sha256").update(storagesLua).digest("hex");
if (storagesSha !== storagesSource.sha256) {
  throw new Error(`${storagesSource.path} does not match the pinned manifest`);
}

const initSource = manifest.sources.canaryQuestCatalog;
const initLua = await readFile(
  join(canaryRoot, CATALOG_DIR, "init.lua"),
  "utf8",
);
const initSha = createHash("sha256").update(initLua).digest("hex");
if (initSha !== initSource.sha256) {
  throw new Error(`${CATALOG_DIR}/init.lua does not match the pinned manifest`);
}

// ---------------------------------------------------------------- catalog
const moduleNames = parseCatalogInit(initLua);
if (moduleNames.length !== EXPECTED_MODULE_COUNT) {
  throw new Error(
    `catalog lists ${moduleNames.length} modules, expected ${EXPECTED_MODULE_COUNT}`,
  );
}
const quests = [];
for (const [index, moduleName] of moduleNames.entries()) {
  const source = await readFile(
    join(canaryRoot, CATALOG_DIR, `${moduleName}.lua`),
    "utf8",
  );
  quests.push(parseCanaryQuestModule(source, index + 1));
}
const missionCount = quests.reduce(
  (total, quest) => total + quest.missions.length,
  0,
);
if (missionCount !== EXPECTED_MISSION_COUNT) {
  throw new Error(
    `parsed ${missionCount} missions, expected ${EXPECTED_MISSION_COUNT}`,
  );
}

// ---------------------------------------------------------------- aliases
const storageIds = parseLuaStorageTable(storagesLua, "Storage");
// World-scoped keyspace, separate from character storages by design; only
// inventoried here (MonsterEventService owns world storage at runtime).
const globalStorageIds = parseLuaStorageTable(storagesLua, "GlobalStorage");
const byId = new Map();
for (const [dotted, id] of storageIds) {
  // Content convention drops the `Storage.` root.
  const key = dotted.slice("Storage.".length);
  const group = byId.get(id) ?? [];
  group.push(key);
  byId.set(id, group);
}
const aliases = {};
let aliasCount = 0;
for (const group of byId.values()) {
  if (group.length < 2) continue;
  // First declaration wins as the canonical row key.
  const [canonical, ...rest] = group;
  for (const alias of rest) {
    aliases[alias] = canonical;
    aliasCount += 1;
  }
}

// Raw numeric storage ids resolve to their named key when storages.lua
// declares one, so every consumer shares a single row per storage.
const nameById = new Map();
for (const [dotted, id] of storageIds) {
  if (!nameById.has(id)) nameById.set(id, dotted.slice("Storage.".length));
}
const resolveKey = (key) =>
  /^\d+$/.test(key) ? (nameById.get(Number(key)) ?? key) : key;
let numericOnlyKeys = 0;
for (const quest of quests) {
  quest.startStorageKey = resolveKey(quest.startStorageKey);
  if (quest.endStorageKey) quest.endStorageKey = resolveKey(quest.endStorageKey);
  for (const mission of quest.missions) {
    mission.storageKey = resolveKey(mission.storageKey);
  }
}

// The catalog may only reference known storage names — a typo upstream (or
// a parser gap here) must fail the import, never ship a dangling key.
// Numeric ids without a declared name stay as digit keys, counted below.
const knownKeys = new Set(
  [...storageIds.keys()].map((dotted) => dotted.slice("Storage.".length)),
);
const knownPrefixes = new Set(
  [...knownKeys].flatMap((key) => {
    const parts = key.split(".");
    return parts
      .slice(0, -1)
      .map((_, index) => parts.slice(0, index + 1).join("."));
  }),
);
let tableReferenceKeys = 0;
for (const quest of quests) {
  const referenced = [
    quest.startStorageKey,
    ...(quest.endStorageKey ? [quest.endStorageKey] : []),
    ...quest.missions.map((mission) => mission.storageKey),
  ];
  for (const key of referenced) {
    if (/^\d+$/.test(key)) {
      numericOnlyKeys += 1;
      continue;
    }
    if (knownKeys.has(key)) continue;
    if (knownPrefixes.has(key)) {
      // Upstream bug carried losslessly: the catalog points at a storage
      // TABLE, so the mission can never evaluate in Canary either. The key
      // reads -1 here, which reproduces that dead mission exactly.
      tableReferenceKeys += 1;
      continue;
    }
    throw new Error(`quest ${quest.name} references unknown storage ${key}`);
  }
}

// ------------------------------------------------------------- inventory
const scriptEntries = await readdir(join(canaryRoot, SCRIPTS_DIR), {
  withFileTypes: true,
});
const scriptDirs = scriptEntries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (scriptDirs.length !== EXPECTED_SCRIPT_DIR_COUNT) {
  throw new Error(
    `found ${scriptDirs.length} quest script dirs, expected ${EXPECTED_SCRIPT_DIR_COUNT}`,
  );
}

const outDir = join(repoRoot, "content/quests");
await mkdir(outDir, { recursive: true });

const source = {
  canaryCommit: commit,
  catalogInitSha256: initSha,
  storagesSha256: storagesSha,
};

await writeFile(
  join(outDir, "canary-quests.json"),
  `${JSON.stringify({ formatVersion: 1, source, quests }, null, 1)}\n`,
);
await writeFile(
  join(outDir, "storage-aliases.json"),
  `${JSON.stringify({ formatVersion: 1, source, aliases }, null, 1)}\n`,
);
await writeFile(
  join(outDir, "canary-quest-import-report.json"),
  `${JSON.stringify(
    {
      formatVersion: 1,
      source,
      counts: {
        questModules: moduleNames.length,
        quests: quests.length,
        missions: missionCount,
        storageNames: storageIds.size,
        globalStorageNames: globalStorageIds.size,
        storageAliases: aliasCount,
        numericOnlyStorageKeys: numericOnlyKeys,
        tableReferenceKeys,
        dynamicDescriptions: quests.reduce(
          (total, quest) =>
            total +
            quest.missions.filter(
              (mission) => mission.dynamicDescription || mission.dynamicStates,
            ).length,
          0,
        ),
        questScriptDirectories: scriptDirs.length,
      },
      // The script directories are quest *behavior* (actions, movements,
      // creature scripts). They stay fail-closed server-side until each is
      // implemented; listing them here keeps the remainder visible instead
      // of silently dropped (Feature 105's completion gate).
      questScriptDirectories: scriptDirs.map((name) => ({
        name,
        status: "pending-behavior",
      })),
    },
    null,
    1,
  )}\n`,
);

console.log(
  `imported ${quests.length} quests (${missionCount} missions), ` +
    `${aliasCount} storage aliases over ${storageIds.size} names, ` +
    `${scriptDirs.length} script dirs inventoried`,
);
