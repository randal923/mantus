import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chestLootedKey,
  classifyChest,
  parseChestUnique,
  parseStorageConstants,
} from "./parseCanaryChestTables.mjs";

const STORAGES_LUA = `
--[[ header comment with a brace { ]]
Storage = {
	Quest = {
		Key = {
			ID0010 = 103,
			ID3801 = 3801,
		},
		U6_1 = {
			EmperorsCookies = {
				Rewards = { Cookies = 40031 },
			},
		},
	},
}

GlobalStorage = {
	NaginataStone = 50001,
}

startupGlobalStorages = {
	Storage.Quest.Key.ID0010,
}
`;

const CHEST_LUA = `
ChestAction = {
	[5000] = { itemId = false, itemPos = { { x = 1, y = 2, z = 3 } } },
}

ChestUnique = {
	-- a plain one-time chest
	[5000] = {
		isKey = true,
		itemId = 387,
		itemPos = { x = 32219, y = 32401, z = 10 },
		reward = { { 2972, 1 } },
		storage = Storage.Quest.Key.ID0010,
	},
	[5004] = {
		isKey = true,
		itemId = 2472,
		itemPos = { x = 32648, y = 31905, z = 3 },
		container = 2853,
		reward = { { 2970, 1 }, { 3598, 27 } },
		weight = 12.00,
		storage = Storage.Quest.U6_1.EmperorsCookies.Rewards.Cookies,
		keyAction = Storage.Quest.Key.ID3801,
	},
	[6000] = {
		useKV = true,
		itemId = 1740,
		itemPos = { x = 100, y = 200, z = 7 },
		randomReward = { { 3031, 5 }, { 3035, 2 } },
		questName = "testkv",
		time = 20,
	},
	[6093] = {
		itemId = 2474,
		itemPos = { x = 1, y = 1, z = 1 },
		reward = { { 2969, 1 } },
		keyAction = Storage.Quest.Key.ID3801,
		storage = keyAction,
	},
	[14001] = {
		itemId = 24877,
		itemPos = { x = 5, y = 5, z = 5 },
	},
}
`;

test("flattens nested storage constants to dotted paths", () => {
  const storages = parseStorageConstants(STORAGES_LUA);
  assert.equal(storages.get("Storage.Quest.Key.ID0010"), 103);
  assert.equal(
    storages.get("Storage.Quest.U6_1.EmperorsCookies.Rewards.Cookies"),
    40031,
  );
  assert.equal(storages.get("GlobalStorage.NaginataStone"), 50001);
});

test("parses ChestUnique entries without touching ChestAction", () => {
  const storages = parseStorageConstants(STORAGES_LUA);
  const chests = parseChestUnique(CHEST_LUA, storages);
  assert.deepEqual(
    chests.map((chest) => chest.uniqueId),
    [5000, 5004, 6000, 6093, 14001],
  );
  const [plain, bagged, kv] = chests;
  assert.deepEqual(plain.positions, [{ x: 32219, y: 32401, z: 10 }]);
  assert.deepEqual(plain.reward, [{ typeId: 2972, count: 1 }]);
  assert.equal(plain.storageKey, 103);
  assert.equal(plain.isKey, true);
  // isKey stamps the key's ActionId from the chest storage, as Canary's
  // quest_reward_common does with setActionId(storage).
  assert.equal(plain.keyActionId, 103);
  assert.equal(bagged.containerTypeId, 2853);
  assert.equal(bagged.keyActionId, 3801);
  assert.equal(bagged.storageKey, 40031);
  assert.equal(bagged.reward.length, 2);
  assert.equal(kv.questName, "testkv");
  assert.equal(kv.timeHours, 20);
  assert.deepEqual(kv.randomReward, [
    { typeId: 3031, count: 5 },
    { typeId: 3035, count: 2 },
  ]);
});

test("classifies chests, never dropping one silently", () => {
  const storages = parseStorageConstants(STORAGES_LUA);
  const chests = parseChestUnique(CHEST_LUA, storages);
  const byId = new Map(chests.map((chest) => [chest.uniqueId, chest]));
  assert.equal(classifyChest(byId.get(5000)).status, "implemented");
  assert.equal(classifyChest(byId.get(5004)).status, "implemented");
  assert.equal(classifyChest(byId.get(6000)).status, "implemented");
  // `storage = keyAction` reads a nil global in Canary too, so it grants
  // nothing there either.
  assert.equal(classifyChest(byId.get(6093)).status, "excluded");
  // Outside quest_reward_common.lua's registered uid ranges.
  assert.equal(classifyChest(byId.get(14001)).status, "deferred");
});

test("derives a stable durable looted key per gate kind", () => {
  const storages = parseStorageConstants(STORAGES_LUA);
  const byId = new Map(
    parseChestUnique(CHEST_LUA, storages).map((chest) => [
      chest.uniqueId,
      chest,
    ]),
  );
  assert.equal(chestLootedKey(byId.get(5000)), "chest-storage:103");
  assert.equal(chestLootedKey(byId.get(6000)), "chest-kv:testkv");
});
