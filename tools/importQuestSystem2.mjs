import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseStorageConstants } from "./parseCanaryChestTables.mjs";
import { parseQuestSystem2 } from "./parseQuestSystem2.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(process.argv[2] ?? process.env.CANARY_PATH ?? "");
if (!process.argv[2] && !process.env.CANARY_PATH) {
  throw new Error("usage: node tools/importQuestSystem2.mjs <canary-checkout>");
}

const manifest = JSON.parse(
  await readFile(join(repoRoot, "content/source-manifest.json"), "utf8"),
);

async function readPinned(source) {
  const contents = await readFile(join(sourceRoot, source.path), "utf8");
  const sha256 = createHash("sha256").update(contents).digest("hex");
  if (sha256 !== source.sha256) {
    throw new Error(`${source.path} does not match the pinned manifest`);
  }
  return contents;
}

const storagesSource = manifest.sources.canaryStorages;
const questSource = manifest.sources.canaryQuestSystem2;
const storages = parseStorageConstants(await readPinned(storagesSource));
const parsed = parseQuestSystem2(await readPinned(questSource), storages);

/**
 * An entry is importable when it maps onto a plain one-time chest grant: use
 * once, receive the items, record the storage as done. Item `text` and
 * `actionId` are supported by the data-driven chest system; everything else
 * (storage state machines, consumed needItems, say lines, magic effects,
 * secondary mission storages, decaying rewards, per-item name overrides, and
 * the 24h `time` flag) defers the entry with the blocking fields named.
 */
function classifyEntry(entry) {
  const blockers = [];
  if (entry.items.length === 0) blockers.push("no reward items");
  if (entry.storage === null) {
    blockers.push(
      `storage ${entry.storageName ?? "(missing)"} does not resolve to a constant`,
    );
  }
  if (entry.formerValue !== undefined && entry.formerValue !== -1) {
    blockers.push(`formerValue=${entry.formerValue} (storage state machine)`);
  }
  if (entry.newValue !== undefined && entry.newValue !== 1) {
    blockers.push(`newValue=${entry.newValue} (storage state machine)`);
  }
  if (entry.needItem !== undefined) {
    blockers.push(`needItem ${entry.needItem.itemId} consumed on use`);
  }
  if (entry.say !== undefined) blockers.push("say line on success");
  if (entry.effectName !== undefined) {
    blockers.push(`magic effect ${entry.effectName}`);
  }
  if (entry.missionStorage !== undefined) {
    blockers.push(
      `missionStorage ${entry.missionStorage.keyName ?? entry.missionStorage.key}`,
    );
  }
  if (entry.items.some((item) => item.decay === true)) {
    blockers.push("decay on a reward item");
  }
  if (entry.items.some((item) => item.name !== undefined)) {
    blockers.push("per-item name override");
  }
  if (entry.time === true) blockers.push("time=true 24h cooldown");
  if (entry.unparsedFields.length > 0) {
    blockers.push(`unrecognised fields: ${entry.unparsedFields.join(", ")}`);
  }
  if (blockers.length === 0) return { status: "importable" };
  return { status: "deferred", reason: blockers.join("; ") };
}

// The handler wraps multi-item rewards in a container before handing them
// over: a bag for up to 8 items, a backpack above that.
const containerTypeId = (entry) =>
  entry.items.length > 1 ? (entry.items.length > 8 ? 2854 : 2853) : null;

const entries = parsed
  .map((entry) => {
    const wrapper = containerTypeId(entry);
    return {
      ...entry,
      ...(wrapper === null ? {} : { containerTypeId: wrapper }),
      ...classifyEntry(entry),
    };
  })
  .sort((left, right) => left.uniqueId - right.uniqueId);

const counts = {
  parsed: entries.length,
  importable: entries.filter((entry) => entry.status === "importable").length,
  deferred: entries.filter((entry) => entry.status === "deferred").length,
};

await writeFile(
  join(repoRoot, "content/items/canary-quest-system2.json"),
  `${JSON.stringify({
    formatVersion: manifest.converters.questSystemChests,
    source: {
      canaryCommit: questSource.commit,
      path: questSource.path,
      sha256: questSource.sha256,
      storagesPath: storagesSource.path,
      storagesSha256: storagesSource.sha256,
    },
    counts,
    entries,
  })}\n`,
);
console.log(
  `imported ${counts.parsed} quest_system2 entries (${counts.importable} importable, ${counts.deferred} deferred)`,
);
