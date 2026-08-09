import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDoorKeyActions } from "./parseCanaryDoorKeys.mjs";

const CONSTANTS = new Map([
  ["Storage.Quest.Key.ID3520", 3520],
  ["Storage.Quest.Key.ID3666", 3666],
  ["Storage.Quest.Key.ID3001", 3001],
]);

const DOOR_KEYS_LUA = `
--[[
Look README.md for look the reserved action of the keys
]]

KeyDoorAction = {
	-- Door of the key 4182 (draconia quest)
	[Storage.Quest.Key.ID3001] = {
		itemId = false,
		itemPos = { { x = 32814, y = 31597, z = 7 } },
	},
	-- Door of the key 1910 (mad mage room quest)
	[Storage.Quest.Key.ID3666] = {
		itemId = 1631,
		itemPos = { x = 32578, y = 32197, z = 15 },
	},
	-- Door of the key 3520 (carlin cemetery)
	[Storage.Quest.Key.ID3520] = {
		itemId = false,
		itemPos = {
			{ x = 32400, y = 31788, z = 8 },
			{ x = 32400, y = 31789, z = 8 },
			{ x = 32398, y = 31804, z = 8 },
		},
	},
}
`;

test("parses key door entries with single and multi position forms", () => {
  assert.deepEqual(parseDoorKeyActions(DOOR_KEYS_LUA, CONSTANTS), [
    {
      actionId: 3001,
      itemId: null,
      positions: [{ x: 32814, y: 31597, z: 7 }],
    },
    {
      actionId: 3666,
      itemId: 1631,
      positions: [{ x: 32578, y: 32197, z: 15 }],
    },
    {
      actionId: 3520,
      itemId: null,
      positions: [
        { x: 32400, y: 31788, z: 8 },
        { x: 32400, y: 31789, z: 8 },
        { x: 32398, y: 31804, z: 8 },
      ],
    },
  ]);
});

test("throws on an unknown storage constant", () => {
  assert.throws(
    () =>
      parseDoorKeyActions(
        DOOR_KEYS_LUA.replace("ID3001", "ID9999"),
        CONSTANTS,
      ),
    /unknown storage constant Storage\.Quest\.Key\.ID9999/,
  );
});

test("throws when two entries claim the same position", () => {
  assert.throws(
    () =>
      parseDoorKeyActions(
        DOOR_KEYS_LUA.replace(
          "{ x = 32814, y = 31597, z = 7 }",
          "{ x = 32400, y = 31789, z = 8 }",
        ),
        CONSTANTS,
      ),
    /position 32400:31789:8 is claimed by action ids 3001 and 3520/,
  );
});

test("throws on a malformed itemId or itemPos", () => {
  assert.throws(
    () =>
      parseDoorKeyActions(
        DOOR_KEYS_LUA.replace("itemId = 1631", "itemId = keyItem"),
        CONSTANTS,
      ),
    /invalid itemId/,
  );
  assert.throws(
    () =>
      parseDoorKeyActions(
        DOOR_KEYS_LUA.replace(
          "{ x = 32578, y = 32197, z = 15 }",
          "{ x = 32578, y = 32197 }",
        ),
        CONSTANTS,
      ),
    /malformed itemPos/,
  );
  assert.throws(
    () =>
      parseDoorKeyActions(
        DOOR_KEYS_LUA.replace("itemId = false,", ""),
        CONSTANTS,
      ),
    /missing itemId or itemPos/,
  );
});
