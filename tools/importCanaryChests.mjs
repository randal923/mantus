import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  chestLootedKey,
  classifyChest,
  parseChestUnique,
  parseStorageConstants,
} from "./parseCanaryChestTables.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(process.argv[2] ?? process.env.CANARY_PATH ?? "");
if (!process.argv[2] && !process.env.CANARY_PATH) {
  throw new Error("usage: node tools/importCanaryChests.mjs <canary-checkout>");
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
const chestSource = manifest.sources.canaryChests;
const storages = parseStorageConstants(await readPinned(storagesSource));
const parsed = parseChestUnique(await readPinned(chestSource), storages);

// The key type ids Canary's quest_reward_common stamps an ActionId onto
// (playerAddItem's isKey branch checks ItemType:isKey() or 21392).
const doorsDocument = JSON.parse(
  await readFile(join(repoRoot, "content/items/canary-doors.json"), "utf8"),
);
const keyItemIds = new Set(doorsDocument.keyItemIds);
const catalogItems = JSON.parse(
  await readFile(join(repoRoot, "server/data/item-catalog.json"), "utf8"),
).items;

// Canary's addItem treats the count of a charged non-stackable (amulets,
// necklaces) as the charge subtype and grants ONE item; keeping it as an
// item count would need one slot per unit and can never be placed (or, for
// small counts, multiplies the reward).
const chargedReward = (reward) => {
  const type = catalogItems[reward.typeId];
  if (
    !type ||
    type.stackable ||
    type.charges === undefined ||
    reward.count <= 1
  ) {
    return reward;
  }
  return { ...reward, count: 1, charges: reward.count };
};

const stampKeyRewards = (rewards, keyActionId) =>
  rewards.map((reward) =>
    keyItemIds.has(reward.typeId)
      ? { ...reward, actionId: keyActionId }
      : reward,
  );

// Chests whose ChestUnique entry only stamps the unique id — the reward
// lives in a dedicated quest script instead of quest_reward_common.lua.
// Rewards and looted keys are transcribed from those scripts at the pinned
// commit; positions/item types still come from the parsed table.
const SCRIPT_ANSWERED_CHESTS = new Map([
  // data-otservbr-global/scripts/actions/rookgaard/rapier_quest.lua:
  // grants one rapier via canGetReward/questKV "rapier".
  [
    14042,
    { reward: [{ typeId: 3272, count: 1 }], lootedKey: "chest-kv:rapier" },
  ],
]);

const chests = [];
const skipped = [];
for (const chest of parsed) {
  const scriptAnswered = SCRIPT_ANSWERED_CHESTS.get(chest.uniqueId);
  if (scriptAnswered && chest.itemTypeId !== null) {
    chests.push({
      uniqueId: chest.uniqueId,
      itemTypeId: chest.itemTypeId,
      positions: chest.positions,
      lootedKey: scriptAnswered.lootedKey,
      reward: scriptAnswered.reward,
    });
    continue;
  }
  const { status, reason } = classifyChest(chest);
  if (status !== "implemented") {
    skipped.push({ uniqueId: chest.uniqueId, status, reason });
    continue;
  }
  const keyActionId = chest.keyActionId;
  chests.push({
    uniqueId: chest.uniqueId,
    itemTypeId: chest.itemTypeId,
    positions: chest.positions,
    lootedKey: chestLootedKey(chest),
    reward: (keyActionId === null
      ? chest.reward
      : stampKeyRewards(chest.reward, keyActionId)
    ).map(chargedReward),
    ...(chest.randomReward.length > 0
      ? { randomReward: chest.randomReward.map(chargedReward) }
      : {}),
    ...(chest.containerTypeId === null
      ? {}
      : { containerTypeId: chest.containerTypeId }),
    ...(chest.timeHours === null ? {} : { cooldownHours: chest.timeHours }),
  });
}

// Two chests may legitimately share one looted key (Canary's paired black
// knight chests), but one position must resolve to exactly one chest. Canary
// stamps duplicates over each other at startup; identical duplicates collapse
// to the lowest unique id, and a genuine conflict is a hard error.
const byPosition = new Map();
const duplicates = new Set();
const payload = (chest) => JSON.stringify({ ...chest, uniqueId: 0 });
for (const chest of chests) {
  for (const position of chest.positions) {
    const key = `${position.x}:${position.y}:${position.z}`;
    const existing = byPosition.get(key);
    if (existing === undefined || existing.uniqueId === chest.uniqueId) {
      byPosition.set(key, chest);
      continue;
    }
    if (payload(existing) !== payload(chest)) {
      throw new Error(
        `chests ${existing.uniqueId} and ${chest.uniqueId} conflict at ${key}`,
      );
    }
    duplicates.add(chest.uniqueId);
    skipped.push({
      uniqueId: chest.uniqueId,
      status: "excluded",
      reason: `identical duplicate placement of chest ${existing.uniqueId}`,
    });
  }
}
const placed = chests.filter((chest) => !duplicates.has(chest.uniqueId));

await writeFile(
  join(repoRoot, "content/items/canary-chests.json"),
  `${JSON.stringify({
    formatVersion: manifest.converters.chests,
    source: {
      canaryCommit: chestSource.commit,
      path: chestSource.path,
      sha256: chestSource.sha256,
      storagesPath: storagesSource.path,
      storagesSha256: storagesSource.sha256,
    },
    counts: {
      parsed: parsed.length,
      implemented: placed.length,
      deferred: skipped.filter((entry) => entry.status === "deferred").length,
      excluded: skipped.filter((entry) => entry.status === "excluded").length,
    },
    chests: placed,
    skipped: [...skipped].sort((left, right) => left.uniqueId - right.uniqueId),
  })}\n`,
);
await writeFile(
  join(repoRoot, "server/data/chests.json"),
  `${JSON.stringify({
    formatVersion: manifest.converters.chests,
    mapName: "otservbr",
    chests: placed,
  })}\n`,
);
console.log(
  `imported ${placed.length} Canary quest chests (${skipped.length} classified as deferred/excluded)`,
);
