import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parseCanaryNpcDialogues } from "./parseCanaryNpcDialogues.mjs";
import { parseCanaryNpcShops } from "./parseCanaryNpcShops.mjs";
import { readMapNavigation } from "./readMapNavigation.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const canaryRoot = resolve(process.argv[2] ?? process.env.CANARY_PATH ?? "");
if (!process.argv[2] && !process.env.CANARY_PATH) {
  throw new Error("usage: node tools/importCanaryNpcs.mjs <canary-checkout>");
}

const manifest = JSON.parse(
  await readFile(join(repoRoot, "content/source-manifest.json"), "utf8"),
);
const commit = execFileSync("git", ["-C", canaryRoot, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (commit !== manifest.canary?.commit) {
  throw new Error(`Canary checkout is ${commit}, expected ${manifest.canary?.commit}`);
}

const creatureReport = JSON.parse(
  await readFile(
    join(repoRoot, "content/spawns/world-import-report.json"),
    "utf8",
  ),
);
if (creatureReport.source?.canaryCommit !== commit) {
  throw new Error("NPC import requires creature content from the same commit");
}
// The creature import's definition index is the authoritative type-id ->
// source mapping for every NPC the pinned world spawns; selecting from it
// (rather than from whatever happens to still be unsupported) keeps this
// import stable as creature-side parity gaps close.
if (!Array.isArray(creatureReport.definitions)) {
  throw new Error("creature import report has no definition index");
}
const selected = creatureReport.definitions
  .filter((definition) => definition.kind === "npc")
  .map((definition) => ({
    typeId: definition.typeId,
    path: definition.sourcePath,
  }))
  .sort((left, right) => left.typeId.localeCompare(right.typeId));
if (selected.length !== 956 || new Set(selected.map(({ typeId }) => typeId)).size !== 956) {
  throw new Error("pinned world NPC definition selection is incomplete");
}

const definitions = await Promise.all(
  selected.map(async (definition) => ({
    ...definition,
    source: await readFile(join(canaryRoot, definition.path), "utf8"),
  })),
);
const itemCatalog = JSON.parse(
  await readFile(join(repoRoot, "server/data/item-catalog.json"), "utf8"),
);
const shops = parseCanaryNpcShops(definitions, itemCatalog.items);
const unsupportedShopRows = shops.report.definitions.flatMap((definition) =>
  definition.unsupportedRows.map((row) => ({ definition, row })),
);
const unsafeShopRows = unsupportedShopRows.filter(
  ({ row }) => row.reason !== "item is missing from the pinned item catalog",
);
if (unsafeShopRows.length > 0) {
  const failures = unsafeShopRows
    .map(({ definition, row }) => `${definition.sourcePath}:${row.line}`)
    .join(", ");
  throw new Error(`NPC shop import has unsupported rows: ${failures}`);
}
if (shops.report.unsupportedCallbacks > 0) {
  const failures = shops.report.definitions
    .filter((definition) => definition.unsupportedCallbacks.length > 0)
    .map((definition) => definition.sourcePath)
    .join(", ");
  throw new Error(`NPC shop import has unsupported callbacks: ${failures}`);
}
// Typed command families need two pinned lookups: the spell catalog a
// `learnSpell` offer must resolve into, and the shared hint table
// `rookgaardHints` reads. Both are hashed so the import fails closed if the
// upstream source drifts.
const spellCatalog = JSON.parse(
  await readFile(join(repoRoot, "content/spells/canary-spells.json"), "utf8"),
);
if (spellCatalog.source?.canaryCommit !== commit) {
  throw new Error("NPC import requires spell content from the same commit");
}
// Only spells this server can actually cast may be sold: the runtime
// catalog drops unsupported entries, so resolving against the raw list
// would sell a spell that could never be used.
const spellIdsByName = new Map(
  spellCatalog.spells
    .filter((spell) => spell.supported === true)
    .map((spell) => [spell.name.toLowerCase(), spell.id]),
);
const npcModulePath = "data/npclib/npc_system/custom_modules.lua";
const npcModuleSource = await readFile(join(canaryRoot, npcModulePath), "utf8");
const npcModuleSha256 = createHash("sha256")
  .update(npcModuleSource)
  .digest("hex");
if (manifest.sources?.canaryNpcModules?.sha256 !== npcModuleSha256) {
  throw new Error(`${npcModulePath} hash ${npcModuleSha256} is not pinned`);
}
const dialogues = parseCanaryNpcDialogues(
  definitions,
  new Set(shops.shops.map((shop) => shop.npcTypeId)),
  { spellIdsByName, rookgaardHints: parseRookgaardHints(npcModuleSource) },
);
const definitionsSha256 = createHash("sha256")
  .update(
    definitions
      .map((definition) => `${definition.path}\0${definition.source}`)
      .sort()
      .join("\0"),
  )
  .digest("hex");
const pinnedNpcSource = manifest.sources?.canaryNpcs;
if (
  pinnedNpcSource?.commit !== commit ||
  pinnedNpcSource.definitionCount !== definitions.length ||
  pinnedNpcSource.definitionsSha256 !== definitionsSha256
) {
  throw new Error("selected Canary NPC definitions do not match the manifest");
}
const source = {
  canaryCommit: commit,
  definitionCount: definitions.length,
  definitionsSha256,
};

// Whole-world destination validation. Travel and kick destinations used to
// be checked only live, at execution time, against a ten-destination
// fixture; every imported destination is now proven against the converted
// map's walkability data before the content is written.
const navigation = readMapNavigation(
  join(repoRoot, "server/data/otservbr.map.bin"),
);
const unavailableDestinations = [];
for (const dialogue of dialogues.dialogues) {
  for (const offer of dialogue.travelOffers) {
    for (const [role, position] of [
      ["destination", offer.destination],
      ...(offer.diversion ? [["diversion", offer.diversion.destination]] : []),
    ]) {
      // The server lands travellers on the nearest free tile within 2, so
      // that is the box the import has to prove reachable.
      if (navigation.hasWalkableWithin(position, 2)) continue;
      unavailableDestinations.push({
        typeId: dialogue.typeId,
        offerId: offer.id,
        role,
        position,
        tile: navigation.tileAt(position),
      });
    }
  }
}
if (unavailableDestinations.length > 0) {
  const failures = unavailableDestinations
    .map(
      (entry) =>
        `${entry.typeId}/${entry.offerId} -> ${entry.position.x},${entry.position.y},${entry.position.z} (${entry.tile})`,
    )
    .join(", ");
  throw new Error(`NPC travel destinations are unreachable: ${failures}`);
}

// Every dialogue must name a type the creature import actually resolved, and
// no type may be defined twice.
const knownTypeIds = new Set(selected.map((definition) => definition.typeId));
const seenDialogueTypeIds = new Set();
for (const dialogue of dialogues.dialogues) {
  if (!knownTypeIds.has(dialogue.typeId)) {
    throw new Error(`NPC dialogue ${dialogue.typeId} has no pinned definition`);
  }
  if (seenDialogueTypeIds.has(dialogue.typeId)) {
    throw new Error(`duplicate NPC dialogue definition ${dialogue.typeId}`);
  }
  seenDialogueTypeIds.add(dialogue.typeId);
  const nodeIds = new Set();
  for (const node of dialogue.nodes) {
    if (nodeIds.has(node.id)) {
      throw new Error(`${dialogue.typeId} has duplicate node ${node.id}`);
    }
    nodeIds.add(node.id);
  }
  const offerIds = new Set();
  for (const offer of dialogue.travelOffers) {
    if (offerIds.has(offer.id)) {
      throw new Error(`${dialogue.typeId} has duplicate offer ${offer.id}`);
    }
    offerIds.add(offer.id);
  }
  for (const node of dialogue.nodes) {
    for (const reference of [
      ...node.children,
      ...(node.nextNodeId ? [node.nextNodeId] : []),
    ]) {
      if (!nodeIds.has(reference)) {
        throw new Error(`${dialogue.typeId}/${node.id} references ${reference}`);
      }
    }
    const offerId = node.action?.offerId ?? node.offerId;
    if (offerId && !offerIds.has(offerId)) {
      throw new Error(`${dialogue.typeId}/${node.id} references offer ${offerId}`);
    }
  }
}
// Every shop catalog must belong to exactly one resolved NPC.
const shopOwners = new Set();
for (const shop of shops.shops) {
  if (!knownTypeIds.has(shop.npcTypeId)) {
    throw new Error(`NPC shop ${shop.id} has no pinned definition`);
  }
  if (shopOwners.has(shop.npcTypeId)) {
    throw new Error(`NPC ${shop.npcTypeId} owns more than one shop catalog`);
  }
  shopOwners.add(shop.npcTypeId);
}

await writeFile(
  join(repoRoot, "content/npcs/canary-dialogue-baseline.json"),
  `${JSON.stringify({
    formatVersion: 1,
    source,
    dialogues: dialogues.dialogues,
  })}\n`,
);
await writeFile(
  join(repoRoot, "content/npcs/canary-shops.json"),
  `${JSON.stringify({
    formatVersion: 2,
    source,
    shops: shops.shops,
  })}\n`,
);

const selectedPaths = new Set(selected.map((definition) => definition.path));
const npcDirectory = join(canaryRoot, "data-otservbr-global/npc");
const unselectedSources = (await readdir(npcDirectory))
  .filter((name) => name.endsWith(".lua"))
  .map((name) => relative(canaryRoot, join(npcDirectory, name)).replaceAll("\\", "/"))
  .filter((path) => !selectedPaths.has(path))
  .sort()
  .map((path) => ({
    sourcePath: path,
    classification: "not-referenced-by-pinned-world-spawns",
  }));
await writeFile(
  join(repoRoot, "content/npcs/canary-npc-import-report.json"),
  `${JSON.stringify(
    {
      formatVersion: 1,
      source,
      shops: shops.report,
      dialogues: dialogues.report,
      // Proven statically against the converted map, not live at execution.
      destinations: {
        checked: dialogues.dialogues.reduce(
          (total, dialogue) =>
            total +
            dialogue.travelOffers.reduce(
              (offers, offer) => offers + (offer.diversion ? 2 : 1),
              0,
            ),
          0,
        ),
        unavailable: unavailableDestinations,
      },
      unselectedSources,
    },
    null,
    2,
  )}\n`,
);

/**
 * `local hints = { [-1] = "...", [0] = { "...", "..." }, ... }` in the pinned
 * npc_system module, in index order from -1 (Canary's initial storage value).
 * A table entry is one hint spoken as several lines, exactly as
 * `npcHandler:say` renders it.
 */
function parseRookgaardHints(source) {
  const start = source.indexOf("local hints = {");
  if (start === -1) throw new Error("pinned NPC module has no hint table");
  const end = source.indexOf("\n}", start);
  if (end === -1) throw new Error("pinned NPC hint table is unterminated");
  const table = source.slice(start, end);
  const hints = [];
  const entry = /\[(-?\d+)\]\s*=\s*(\{[\s\S]*?\n\t\}|"(?:[^"\\]|\\.)*")/g;
  for (const match of table.matchAll(entry)) {
    const lines = [...match[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((line) =>
      line[1]
        .replace(/\\z\s*/g, "")
        .replace(/\\n/g, " ")
        .replace(/\\(.)/g, "$1")
        .replace(/\s+/g, " ")
        .trim(),
    );
    if (lines.length === 0) throw new Error("pinned NPC hint entry is empty");
    hints[Number(match[1]) + 1] = lines;
  }
  if (
    hints.length === 0 ||
    Array.from(hints.keys()).some((index) => hints[index] === undefined)
  ) {
    throw new Error("pinned NPC hint table is not a dense index run");
  }
  return hints;
}

console.log(
  `imported ${dialogues.dialogues.length} NPC dialogue baselines and ` +
    `${shops.shops.length} shop catalogs (${shops.report.importedOffers} offers)`,
);
console.log(
  `reported ${dialogues.report.unsupportedKeywordActions} procedural keyword actions, ` +
    `${dialogues.report.unsupportedMessages} dynamic messages, ` +
    `${dialogues.report.proceduralCallbacks} custom callbacks, and ` +
    `${unselectedSources.length} unspawned NPC sources`,
);
