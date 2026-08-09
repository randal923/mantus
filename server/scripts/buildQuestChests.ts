import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadMapData } from "../src/loadMapData";
import {
  buildQuestChestDefinitions,
  type QuestSystem2Entry,
} from "../src/chest/buildQuestChestDefinitions";
import { loadItemCatalog } from "../src/item/loadItemCatalog";
import { loadWorldItemSources } from "../src/item/loadWorldItemSources";
import type { WorldItemSource } from "../src/item/WorldItemSource";

/**
 * Generates server/data/quest-chests.json: ChestService definitions for the
 * map chests Canary scripts through quest_system1 (aid 2000 + specialQuests
 * aids) and quest_system2 (aid 2001), joined against the converted map's
 * world items so the rewards are exactly what the map chest contains.
 */

const MAP_NAME = "otservbr";
const DATA_DIR = fileURLToPath(new URL("../data", import.meta.url));
const CONTENT_PATH = fileURLToPath(
  new URL(`../data/${MAP_NAME}.content.json`, import.meta.url),
);
const CHESTS_PATH = fileURLToPath(
  new URL("../data/chests.json", import.meta.url),
);
const QUEST_SYSTEM2_PATH = fileURLToPath(
  new URL("../../content/items/canary-quest-system2.json", import.meta.url),
);
const OUTPUT_PATH = fileURLToPath(
  new URL("../data/quest-chests.json", import.meta.url),
);

const QUEST_ACTION_IDS = new Set([2000, 2001, 51400, 51715, 51716, 51717]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const catalog = await loadItemCatalog();
const mapData = loadMapData(DATA_DIR, MAP_NAME, undefined, catalog);
const sources = loadWorldItemSources(await readFile(CONTENT_PATH), MAP_NAME);

const questSystem2Document: unknown = JSON.parse(
  await readFile(QUEST_SYSTEM2_PATH, "utf8"),
);
if (
  !isRecord(questSystem2Document) ||
  !Array.isArray(questSystem2Document.entries)
) {
  throw new Error("canary-quest-system2.json has an unsupported format");
}
const questSystem2Entries = questSystem2Document.entries.map(
  (entry): QuestSystem2Entry => {
    if (
      !isRecord(entry) ||
      !Number.isInteger(entry.uniqueId) ||
      !Number.isInteger(entry.storage) ||
      !Array.isArray(entry.items) ||
      (entry.status !== "importable" && entry.status !== "deferred")
    ) {
      throw new Error("canary-quest-system2.json has a malformed entry");
    }
    return entry as unknown as QuestSystem2Entry;
  },
);

const chestsDocument: unknown = JSON.parse(await readFile(CHESTS_PATH, "utf8"));
if (!isRecord(chestsDocument) || !Array.isArray(chestsDocument.chests)) {
  throw new Error("chests.json has an unsupported format");
}
const existingChests = chestsDocument.chests as Array<{
  positions: Array<{ x: number; y: number; z: number }>;
}>;

// Every quest chest carries source attributes, so the content.json instance
// list names each candidate position; the map loader is still the authority
// for what actually stands there (typeId comes from items.bin).
const worldItems: WorldItemSource[] = [];
const missingFromLoader: Array<{
  instanceId: string;
  uniqueId: number | undefined;
  position: { x: number; y: number; z: number };
}> = [];
let aid2000Seen = 0;
let aid2001Seen = 0;
let specialAidSeen = 0;
for (const [instanceId, source] of sources) {
  const actionId = source.attributes.actionId;
  if (typeof actionId !== "number" || !QUEST_ACTION_IDS.has(actionId)) continue;
  if (actionId === 2000) aid2000Seen += 1;
  else if (actionId === 2001) aid2001Seen += 1;
  else specialAidSeen += 1;
  const [, x, y, z] = instanceId.split(":");
  const position = { x: Number(x), y: Number(y), z: Number(z) };
  const item = mapData
    .getItems(position)
    .find((candidate) => candidate.instanceId === instanceId);
  if (item?.source === undefined) {
    // The converter classified this quest item interactive scenery rather
    // than mutable, so the loader yields no world item for it (and the game
    // cannot open it as a chest either). Recorded as deferred: fixing it
    // means extending MUTABLE_ITEM_IDS and re-running map:convert.
    const uid = source.attributes.uniqueId;
    missingFromLoader.push({
      instanceId,
      uniqueId: Number.isInteger(uid) ? Number(uid) : undefined,
      position,
    });
    continue;
  }
  worldItems.push(item.source);
}

const result = buildQuestChestDefinitions(
  worldItems,
  catalog,
  questSystem2Entries,
  existingChests,
);

const skipped = [
  ...result.skipped,
  ...missingFromLoader.map((entry) => ({
    ...(entry.uniqueId !== undefined ? { uniqueId: entry.uniqueId } : {}),
    position: entry.position,
    status: "deferred" as const,
    reason:
      "map item is not mutable in the converted map (loader yields no world item)",
  })),
].sort(
  (left, right) =>
    (left.uniqueId ?? Number.MAX_SAFE_INTEGER) -
      (right.uniqueId ?? Number.MAX_SAFE_INTEGER) ||
    (left.position?.x ?? 0) - (right.position?.x ?? 0) ||
    (left.position?.y ?? 0) - (right.position?.y ?? 0) ||
    (left.position?.z ?? 0) - (right.position?.z ?? 0) ||
    left.reason.localeCompare(right.reason),
);

for (const chest of result.chests) {
  for (const position of chest.positions) {
    const present = mapData
      .getItems(position)
      .some((item) => item.itemId === chest.itemTypeId);
    if (!present) {
      throw new Error(
        `generated chest ${chest.uniqueId} has no map item of type ${chest.itemTypeId} at ${position.x},${position.y},${position.z}`,
      );
    }
  }
}

const importableUids = new Set(
  questSystem2Entries
    .filter((entry) => entry.status === "importable")
    .map((entry) => entry.uniqueId),
);
const generatedUids = new Set(result.chests.map((chest) => chest.uniqueId));
const importableWithoutMapItem = [...importableUids].filter(
  (uid) => !generatedUids.has(uid),
);

const payload = {
  formatVersion: 1,
  mapName: MAP_NAME,
  chests: result.chests,
  skipped,
  notes: result.notes,
};
await writeFile(OUTPUT_PATH, `${JSON.stringify(payload)}\n`);

const histogram = new Map<string, number>();
for (const skip of skipped) {
  const key = `${skip.status}: ${skip.reason}`;
  histogram.set(key, (histogram.get(key) ?? 0) + 1);
}

console.log(`aid-2000 map items seen: ${aid2000Seen}`);
console.log(`specialQuests-aid map items seen: ${specialAidSeen}`);
console.log(`aid-2001 map items seen: ${aid2001Seen}`);
console.log(`chests generated: ${result.chests.length}`);
console.log(`notes recorded: ${result.notes.length}`);
console.log(`skipped: ${skipped.length}`);
for (const [reason, count] of [...histogram].sort(
  (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
)) {
  console.log(`  ${count} x ${reason}`);
}
if (importableWithoutMapItem.length > 0) {
  console.log(
    `importable quest_system2 entries without a generated chest: ${importableWithoutMapItem.join(", ")}`,
  );
}
if (missingFromLoader.length > 0) {
  console.log(
    `quest items the loader did not yield as mutable world items (${missingFromLoader.length}):`,
  );
  for (const entry of missingFromLoader) {
    console.log(`  ${entry.instanceId}`);
  }
}
