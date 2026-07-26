import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  parseCanaryQuestModule,
  parseCatalogInit,
  parseLuaStorageTable,
} from "./parseCanaryQuestCatalog.mjs";

test("parses nested storage tables with positional and commented entries", () => {
  const source = `
--[[ block comment ]]
Storage = {
	Simple = 30001, -- trailing note
	Nested = {
		Leaf = 30002,
		Mixed = {
			30003,
			Named = 30004,
		},
	},
}
GlobalStorage = {
	WorldThing = 65000,
}
`;
  const entries = parseLuaStorageTable(source, "Storage");
  assert.equal(entries.get("Storage.Simple"), 30001);
  assert.equal(entries.get("Storage.Nested.Leaf"), 30002);
  assert.equal(entries.get("Storage.Nested.Mixed.1"), 30003);
  assert.equal(entries.get("Storage.Nested.Mixed.Named"), 30004);
  assert.equal(entries.size, 4);
  const globals = parseLuaStorageTable(source, "GlobalStorage");
  assert.equal(globals.get("GlobalStorage.WorldThing"), 65000);
});

test("parses a quest module with states, escapes and dynamic entries", () => {
  const source = `
local quest = {
	name = "Example Quest",
	startStorageId = Storage.Quest.U1_0.Example.Line,
	startStorageValue = 1,
	missions = {
		[1] = {
			name = "First",
			storageId = Storage.Quest.U1_0.Example.Line,
			missionId = 7,
			startValue = 1,
			endValue = 3,
			states = {
				[1] = "Line one \\z
					continues.",
				[2] = 'Quoted \\'text\\' with "inner" marks.',
				[3] = function(player)
					if player then
						return "dynamic"
					end
				end,
			},
		},
		[2] = {
			name = "Second",
			storageId = Storage.Quest.U1_0.Example.Other,
			missionId = 8,
			startValue = 1,
			endValue = 2,
			ignoreendvalue = true,
			description = function(player)
				return "dynamic"
			end,
		},
	},
}

return quest
`;
  const quest = parseCanaryQuestModule(source, 3);
  assert.equal(quest.questId, 3);
  assert.equal(quest.startStorageKey, "Quest.U1_0.Example.Line");
  assert.equal(quest.missions.length, 2);
  const [first, second] = quest.missions;
  assert.equal(first.states.length, 2);
  assert.equal(first.states[0].description, "Line one continues.");
  assert.equal(first.states[1].description, `Quoted 'text' with "inner" marks.`);
  assert.equal(first.dynamicStates, 1);
  assert.equal(second.ignoreEndValue, true);
  assert.equal(second.dynamicDescription, true);
  assert.equal(second.description, undefined);
});

test("reads the ordered module list from init.lua", () => {
  const modules = parseCatalogInit(`
local questModules = {
	"001_first_quest",
	"002_second_quest",
}
`);
  assert.deepEqual(modules, ["001_first_quest", "002_second_quest"]);
});
