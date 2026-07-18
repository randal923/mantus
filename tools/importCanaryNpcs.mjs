import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parseCanaryNpcDialogues } from "./parseCanaryNpcDialogues.mjs";
import { parseCanaryNpcShops } from "./parseCanaryNpcShops.mjs";

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
const selected = creatureReport.unsupportedDefinitions
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
const dialogues = parseCanaryNpcDialogues(
  definitions,
  new Set(shops.shops.map((shop) => shop.npcTypeId)),
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
      unselectedSources,
    },
    null,
    2,
  )}\n`,
);

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
