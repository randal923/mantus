import assert from "node:assert/strict";
import { test } from "node:test";
import { parseStorageConstants } from "./parseCanaryChestTables.mjs";
import { parseQuestSystem2 } from "./parseQuestSystem2.mjs";

const STORAGES_LUA = `
Storage = {
	Quest = {
		U7_6 = {
			HydraEggQuest = 40001,
			TheApeCity = { WitchesCapSpot = 40002 },
		},
		U8_0 = {
			TheIceIslands = {
				Questline = 40010,
				Mission09 = 40011,
			},
		},
	},
}

GlobalStorage = {
	Unused = 99999,
}
`;

const QUEST_LUA = `
local config = {
	[9255] = { -- Hydra Egg Quest
		items = {
			{ itemId = 4839 },
		},
		storage = Storage.Quest.U7_6.HydraEggQuest,
	},
	[2285] = {
		items = {
			{ itemId = 3243, count = 2, actionId = 3980 },
		},
		storage = Storage.Quest.U8_0.TheIceIslands.Questline,
		formerValue = 1,
		newValue = 2,
		needItem = { itemId = 3231 },
		say = "A batch of documents, with an escaped \\"quote\\".",
		effect = CONST_ME_MAGIC_BLUE,
		missionStorage = { key = Storage.Quest.U8_0.TheIceIslands.Mission09, value = 2 },
	},
	[9256] = {
		items = {
			{ itemId = 4829, decay = true },
		},
		storage = Storage.Quest.U7_6.TheApeCity.WitchesCapSpot,
		time = true,
	},
	[14037] = {
		items = {
			{
				itemId = 2820,
				text = [[
History of the Augur, Part II
-------- a line of dashes, {braces}, and a comma, inside the text --------]],
				name = "History of the Augur, Part II",
			},
			{ itemId = 2820, text = "a short note" },
		},
		storage = Storage.Quest.Missing.Constant,
		formerValue = 0,
		newValue = 1,
	},
	[65201] = {
		items = {
			{ itemId = 2968, sparkle = true },
		},
		storage = 857440,
		flavour = "unknown",
	},
	-- 65203 reservado
}

local questSystem2 = Action()

function questSystem2.onUse(player, item, fromPosition, target, toPosition, isHotkey)
	local useItem = config[item.uid]
	return true
end

questSystem2:aid(2001)
questSystem2:register()
`;

const parseAll = () =>
  parseQuestSystem2(QUEST_LUA, parseStorageConstants(STORAGES_LUA));

test("parses every config entry, ignoring comments and the handler", () => {
  const entries = parseAll();
  assert.deepEqual(
    entries.map((entry) => entry.uniqueId),
    [9255, 2285, 9256, 14037, 65201],
  );
  const plain = entries[0];
  assert.deepEqual(plain.items, [{ itemId: 4839, count: 1 }]);
  assert.equal(plain.storage, 40001);
  assert.equal(plain.storageName, "Storage.Quest.U7_6.HydraEggQuest");
  assert.equal(plain.formerValue, undefined);
  assert.deepEqual(plain.unparsedFields, []);
});

test("captures the storage state machine, needItem, say, effect, mission", () => {
  const [, gated] = parseAll();
  assert.deepEqual(gated.items, [{ itemId: 3243, count: 2, actionId: 3980 }]);
  assert.equal(gated.formerValue, 1);
  assert.equal(gated.newValue, 2);
  assert.deepEqual(gated.needItem, { itemId: 3231, count: 1 });
  assert.equal(gated.say, 'A batch of documents, with an escaped "quote".');
  assert.equal(gated.effectName, "CONST_ME_MAGIC_BLUE");
  assert.deepEqual(gated.missionStorage, {
    key: 40011,
    keyName: "Storage.Quest.U8_0.TheIceIslands.Mission09",
    value: 2,
  });
});

test("captures decay and the 24h time flag", () => {
  const [, , timed] = parseAll();
  assert.deepEqual(timed.items, [{ itemId: 4829, count: 1, decay: true }]);
  assert.equal(timed.time, true);
});

test("parses long-string texts verbatim and null-resolves unknown storages", () => {
  const [, , , books] = parseAll();
  assert.equal(books.items.length, 2);
  assert.equal(
    books.items[0].text,
    "History of the Augur, Part II\n-------- a line of dashes, {braces}, and a comma, inside the text --------",
  );
  assert.equal(books.items[0].name, "History of the Augur, Part II");
  assert.equal(books.items[1].text, "a short note");
  assert.equal(books.storage, null);
  assert.equal(books.storageName, "Storage.Quest.Missing.Constant");
  assert.equal(books.formerValue, 0);
  assert.equal(books.newValue, 1);
});

test("keeps numeric storage literals and records unknown fields", () => {
  const numeric = parseAll().at(-1);
  assert.equal(numeric.storage, 857440);
  assert.equal(numeric.storageName, null);
  assert.deepEqual(numeric.unparsedFields, ["items[0].sparkle", "flavour"]);
});

test("throws on unparseable entries instead of skipping them", () => {
  const storages = parseStorageConstants(STORAGES_LUA);
  assert.throws(
    () =>
      parseQuestSystem2(
        "local config = {\n\t[1] = {\n\t\titems = {\n\t\t\t{ itemId = oops },\n\t\t},\n\t},\n}",
        storages,
      ),
    /itemId: expected an integer/,
  );
  assert.throws(
    () => parseQuestSystem2("local other = {}", storages),
    /config table literal not found/,
  );
});
