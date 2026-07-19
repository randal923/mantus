import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseDoorPairs,
  parseKeyItemIds,
  parseLevelDoorPositions,
} from "./parseCanaryDoorTables.mjs";

const DOORS_LUA = `
keysID = { 2967, 2968 }

KeyDoorTable = {
	{ lockedDoor = 1628, closedDoor = 1629, openDoor = 1630 },
}

CustomDoorTable = {
	{ closedDoor = 1638, openDoor = 1639 },
	--[[ commented out
	{ closedDoor = 30049, openDoor = 30035 },
	]]
	{ closedDoor = 30833, openDoor = 30837 },
	{ closedDoor = 30834, openDoor = 30837 },
	--{ closedDoor = 33335 }, -- quest door
}

QuestDoorTable = {
	{ closedDoor = 1642, openDoor = 1643 },
}

LevelDoorTable = {
	{ closedDoor = 1646, openDoor = 1647 },
}
`;

const LEVEL_DOORS_LUA = `
LevelDoorAction = {
	-- Doors for level 20
	[1020] = {
		itemId = false,
		itemPos = {
			{ x = 32673, y = 32100, z = 8 },
		},
	},
	[1030] = {
		itemId = false,
		itemPos = {
			{ x = 33302, y = 31691, z = 11 },
			{ x = 33302, y = 31692, z = 11 },
		},
	},
}
`;

test("parses the four door tables into typed pairs", () => {
  assert.deepEqual(parseDoorPairs(DOORS_LUA), [
    { variant: "key", lockedId: 1628, closedId: 1629, openId: 1630 },
    { variant: "custom", closedId: 1638, openId: 1639 },
    { variant: "custom", closedId: 30833, openId: 30837 },
    { variant: "custom", closedId: 30834, openId: 30837 },
    { variant: "quest", closedId: 1642, openId: 1643 },
    { variant: "level", closedId: 1646, openId: 1647 },
  ]);
});

test("parses key item ids and rejects a duplicated closed door id", () => {
  assert.deepEqual(parseKeyItemIds(DOORS_LUA), [2967, 2968]);
  assert.throws(
    () =>
      parseDoorPairs(
        DOORS_LUA.replace(
          "{ closedDoor = 1642, openDoor = 1643 },",
          "{ closedDoor = 1638, openDoor = 1643 },",
        ),
      ),
    /appears in two pairs/,
  );
});

test("parses level door positions with the 1000-offset action id", () => {
  assert.deepEqual(parseLevelDoorPositions(LEVEL_DOORS_LUA), [
    { x: 32673, y: 32100, z: 8, level: 20 },
    { x: 33302, y: 31691, z: 11, level: 30 },
    { x: 33302, y: 31692, z: 11, level: 30 },
  ]);
});
