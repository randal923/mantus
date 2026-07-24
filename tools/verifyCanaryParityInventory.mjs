import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const manifest = readJson("content/source-manifest.json");
const inventory = readJson("content/canary-parity-inventory.json");
const spells = readJson("content/spells/canary-spells.json");
const creatureReport = readJson("content/spawns/world-import-report.json");
const itemSemantics = readJson("content/canary-item-semantics.json");
const monsterTypes = readJson("content/monsters/world-monsters.json");
const npcTypes = readJson("content/npcs/world-npcs.json");
const npcImportReport = readJson("content/npcs/canary-npc-import-report.json");
const npcDialogueBaseline = readJson(
  "content/npcs/canary-dialogue-baseline.json",
);
const npcShops = readJson("content/npcs/canary-shops.json");
const spawnDefinitions = readJson("content/spawns/world-spawns.json");
const foodDefinitions = readJson("content/items/canary-foods.json");

for (const converter of manifest.converterSources ?? []) {
  if (
    typeof converter.path !== "string" ||
    !/^[a-f0-9]{64}$/.test(converter.sha256)
  ) {
    throw new Error("source manifest has an invalid converter hash");
  }
  const actual = createHash("sha256")
    .update(readFileSync(join(repoRoot, converter.path)))
    .digest("hex");
  if (actual !== converter.sha256) {
    throw new Error(`converter ${converter.path} differs from its manifest hash`);
  }
}

if (
  inventory.formatVersion !== 1 ||
  inventory.source?.commit !== manifest.canary?.commit
) {
  throw new Error("Canary parity inventory has invalid provenance");
}
const sourceIds = new Set();
for (const source of inventory.sourceFiles ?? []) {
  if (
    typeof source.path !== "string" ||
    !/^[a-f0-9]{40}$/.test(source.blob) ||
    typeof source.ownerTodo !== "string" ||
    !["implemented", "blocked", "non-content"].includes(source.status) ||
    typeof source.reason !== "string" ||
    sourceIds.has(source.path)
  ) {
    throw new Error(`invalid or duplicate parity source ${String(source.path)}`);
  }
  if (source.status === "blocked" && typeof source.blockedBy !== "string") {
    throw new Error(`blocked parity source ${source.path} has no dependency`);
  }
  sourceIds.add(source.path);
}
const treeHash = createHash("sha256")
  .update(
    inventory.sourceFiles
      .map((source) => `${source.blob} ${source.path}`)
      .sort()
      .join("\n"),
  )
  .digest("hex");
if (treeHash !== inventory.source.sourceTreeSha256) {
  throw new Error("Canary parity source tree hash does not match its entries");
}

const callbackIds = new Set();
for (const callback of inventory.callbacks ?? []) {
  const id = `${callback.sourcePath}#${callback.name}`;
  if (
    !sourceIds.has(callback.sourcePath) ||
    typeof callback.ownerTodo !== "string" ||
    !["implemented", "blocked", "non-content"].includes(callback.status) ||
    typeof callback.reason !== "string" ||
    callbackIds.has(id)
  ) {
    throw new Error(`invalid or duplicate parity callback ${id}`);
  }
  if (callback.status === "blocked" && typeof callback.blockedBy !== "string") {
    throw new Error(`blocked parity callback ${id} has no dependency`);
  }
  callbackIds.add(id);
}

for (const spell of spells.spells ?? []) {
  if (
    !sourceIds.has(spell.sourcePath) ||
    !spell.parity ||
    spell.parity.ownerTodo !== "07-combat" ||
    !["implemented", "blocked", "non-content"].includes(spell.parity.status) ||
    (spell.parity.status === "implemented") !== spell.supported ||
    (spell.parity.status === "blocked" &&
      typeof spell.parity.blockedBy !== "string") ||
    typeof spell.parity.reason !== "string"
  ) {
    throw new Error(`spell ${String(spell.id)} has invalid parity ownership`);
  }
}

// The inventory is generated from the spell report, so its per-spell entries
// must stay in lockstep with it. Without this the two can silently disagree —
// a spell can be `supported` in the report while its inventory source/callback
// entries still read `blocked` (the exact drift a stale, un-regenerated
// inventory produces), and every structural check above still passes.
const inventorySourceByPath = new Map(
  inventory.sourceFiles.map((source) => [source.path, source]),
);
const inventoryCallbacksByPath = new Map();
for (const callback of inventory.callbacks ?? []) {
  const list = inventoryCallbacksByPath.get(callback.sourcePath) ?? [];
  list.push(callback);
  inventoryCallbacksByPath.set(callback.sourcePath, list);
}
for (const spell of spells.spells ?? []) {
  const source = inventorySourceByPath.get(spell.sourcePath);
  if (!source || source.status !== spell.parity.status) {
    throw new Error(
      `parity inventory source ${spell.sourcePath} is stale against the spell report`,
    );
  }
  if (!spell.supported) continue;
  for (const callback of inventoryCallbacksByPath.get(spell.sourcePath) ?? []) {
    const deferredOptionalFeature =
      callback.status === "blocked" &&
      callback.blockedBy === "15-optional-features";
    if (callback.status !== "implemented" && !deferredOptionalFeature) {
      throw new Error(
        `parity inventory callback ${spell.sourcePath}#${callback.name} is stale against its supported spell`,
      );
    }
  }
}

// Same lockstep guarantee for the creature and NPC domains: a monster source is
// `implemented` exactly when the creature report does NOT list it as
// unsupported, and every NPC source stays `blocked` until an NPC dialogue
// runtime lands. A stale inventory would otherwise keep a now-clean monster
// `blocked` (or a newly-gapped one `implemented`) while all structural checks
// still pass.
const unsupportedCreaturePaths = new Set(
  (creatureReport.unsupportedDefinitions ?? []).map(
    (definition) => definition.sourcePath,
  ),
);
for (const source of inventory.sourceFiles) {
  if (source.path.startsWith("data-otservbr-global/monster/")) {
    const expected = unsupportedCreaturePaths.has(source.path)
      ? "blocked"
      : "implemented";
    if (source.status !== expected) {
      throw new Error(
        `parity inventory monster ${source.path} is stale against the creature report`,
      );
    }
  } else if (
    source.path.startsWith("data-otservbr-global/npc/") &&
    source.status !== "blocked"
  ) {
    throw new Error(
      `parity inventory npc ${source.path} must stay blocked until the NPC dialogue runtime lands`,
    );
  }
}
for (const definition of creatureReport.unsupportedDefinitions ?? []) {
  for (const gap of definition.gaps ?? []) {
    if (
      typeof gap.name !== "string" ||
      typeof gap.ownerTodo !== "string" ||
      !["blocked", "non-content"].includes(gap.status) ||
      (gap.status === "blocked" && typeof gap.blockedBy !== "string") ||
      typeof gap.reason !== "string"
    ) {
      throw new Error(
        `creature ${definition.typeId} gap ${String(gap.name)} has no owner`,
      );
    }
  }
  if (
    (definition.ignoredAssignments.length +
      definition.proceduralCallbacks.length) !==
    definition.gaps?.length
  ) {
    throw new Error(`creature ${definition.typeId} has unowned ignored fields`);
  }
}

const importedShopOffers = npcShops.shops.flatMap(
  (shop) => shop.entries,
).length;
if (
  npcImportReport.source?.canaryCommit !== manifest.canary?.commit ||
  npcDialogueBaseline.source?.definitionsSha256 !==
    npcImportReport.source?.definitionsSha256 ||
  npcShops.source?.definitionsSha256 !==
    npcImportReport.source?.definitionsSha256 ||
  npcImportReport.dialogues?.sourceDefinitions !== 956 ||
  npcImportReport.dialogues?.interactiveDefinitions !== 949 ||
  npcImportReport.dialogues?.definitions?.length !== 956 ||
  npcDialogueBaseline.dialogues?.length !== 949 ||
  npcImportReport.shops?.catalogs !== 284 ||
  npcShops.shops?.length !== 284 ||
  npcImportReport.shops?.importedOffers !== 8_368 ||
  importedShopOffers !== 8_368 ||
  npcImportReport.shops?.declaredRows !==
    npcImportReport.shops?.importedOffers +
      npcImportReport.shops?.unsupportedRows ||
  npcImportReport.shops?.unsupportedCallbacks !== 0
) {
  throw new Error("generated NPC import coverage is stale or incomplete");
}

const expectedCounts = {
  sourceFiles: inventory.sourceFiles.length,
  callbacks: inventory.callbacks.length,
  itemDefinitions: Object.keys(itemSemantics.items ?? {}).length,
  foodDefinitions: Object.keys(foodDefinitions.foods ?? {}).length,
  spells: spells.spells?.length ?? 0,
  monsterTypes: monsterTypes.types?.length ?? 0,
  npcTypes: npcTypes.types?.length ?? 0,
  monsterPlacements:
    spawnDefinitions.slots?.filter((slot) => slot.kind === "monster").length ?? 0,
  npcPlacements:
    spawnDefinitions.slots?.filter((slot) => slot.kind === "npc").length ?? 0,
};
if (JSON.stringify(inventory.counts) !== JSON.stringify(expectedCounts)) {
  throw new Error("Canary parity aggregate counts are stale");
}
console.log(
  `verified ${expectedCounts.sourceFiles} Canary sources, ${expectedCounts.callbacks} callbacks, and ${expectedCounts.spells} spells`,
);

function readJson(path) {
  return JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
}
