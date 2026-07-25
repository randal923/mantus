import assert from "node:assert/strict";
import test from "node:test";
import { parseCanaryNpcDialogues } from "./parseCanaryNpcDialogues.mjs";

test("imports greetings, static keyword trees, bank, and shop actions", () => {
  const result = parseCanaryNpcDialogues(
    [
      {
        typeId: "rudolph",
        path: "npc/rudolph.lua",
        source: `
local keywordHandler = KeywordHandler:new()
local npcHandler = NpcHandler:new(keywordHandler)
npcHandler:setMessage(MESSAGE_GREET, { "Oh, a customer.", "Hello |PLAYERNAME|." })
npcHandler:setMessage(MESSAGE_SENDTRADE, "Browse through my wares.")
local clothes = keywordHandler:addKeyword({ "clothes" }, StdModule.say, { npcHandler = npcHandler, text = "I sew them myself." })
clothes:addChildKeyword({ "cape" }, StdModule.say, { npcHandler = npcHandler, text = "A fine \\z
  cape." })
npc:parseBank(message, npc, creature, npcHandler)
npcHandler:addModule(FocusModule:new(), npcConfig.name, true, true, true)
`,
      },
    ],
    new Set(["rudolph"]),
  );

  const graph = result.dialogues[0];
  assert.deepEqual(graph.greeting, [
    "Oh, a customer.",
    "Hello |PLAYERNAME|.",
  ]);
  assert.ok(graph.nodes.some((node) => node.action?.kind === "shop"));
  assert.ok(graph.nodes.some((node) => node.action?.kind === "bank"));
  assert.ok(
    graph.nodes.some(
      (node) =>
        node.matches[0]?.[0] === "clothes" &&
        node.responses[0] === "I sew them myself.",
    ),
  );
  assert.ok(graph.nodes.some((node) => node.responses[0] === "A fine cape."));
  assert.equal(result.report.unsupportedKeywordActions, 0);
});

test("classifies non-interactive NPCs and reports procedural keyword actions", () => {
  const result = parseCanaryNpcDialogues(
    [
      {
        typeId: "statue",
        path: "npc/statue.lua",
        source: "npcType.onThink = function() end",
      },
      {
        typeId: "priest",
        path: "npc/priest.lua",
        source: `
local npcHandler = NpcHandler:new(keywordHandler)
npcHandler:setMessage(MESSAGE_GREET, npcConfig.name .. " welcomes you")
keywordHandler:addKeyword({ "bless" }, StdModule.bless, { npcHandler = npcHandler })
npcHandler:addModule(FocusModule:new(), npcConfig.name, true, true, true)
`,
      },
    ],
    new Set(),
  );

  assert.equal(result.dialogues.length, 1);
  assert.equal(result.report.nonInteractiveDefinitions, 1);
  assert.equal(result.report.unsupportedKeywordActions, 1);
  assert.equal(result.report.unsupportedMessages, 1);
});

test("imports the typed command families with their conditions and effects", () => {
  const result = parseCanaryNpcDialogues(
    [
      {
        typeId: "teacher",
        path: "npc/teacher.lua",
        source: `
local keywordHandler = KeywordHandler:new()
local npcHandler = NpcHandler:new(keywordHandler)
local spell = keywordHandler:addKeyword({ "light" }, StdModule.say, { npcHandler = npcHandler, onlyFocus = true, text = "Learn {light} for 500 gold?" })
spell:addChildKeyword({ "yes" }, StdModule.learnSpell, { npcHandler = npcHandler, premium = false, spellName = "Light", vocation = { 1 }, price = 500, level = 8 })
keywordHandler:addKeyword({ "passage" }, StdModule.travel, { npcHandler = npcHandler, text = "Set the sails!", destination = Position(100, 200, 7), cost = 60, level = 20 })
keywordHandler:addKeyword({ "out" }, StdModule.kick, { npcHandler = npcHandler, text = "Off with you!", destination = Position(101, 201, 7) })
keywordHandler:addKeyword({ "promot" }, StdModule.promotePlayer, { npcHandler = npcHandler, cost = 20000, level = 20, text = "You are promoted." })
keywordHandler:addKeyword({ "leave" }, StdModule.say, { npcHandler = npcHandler, text = "Bye then.", ungreet = true })
keywordHandler:addKeyword({ "mission" }, StdModule.say, { npcHandler = npcHandler, text = "Bring me water." }, function(player)
  return player:getStorageValue(Storage.Quest.Example.Line) == -1
end, function(player)
  player:setStorageValue(Storage.Quest.Example.Line, 1)
end)
npcHandler:addModule(FocusModule:new(), npcConfig.name, true, true, true)
`,
      },
    ],
    new Set(),
    { spellIdsByName: new Map([["light", "utevo-lux"]]) },
  );

  const graph = result.dialogues[0];
  const byKind = (kind) =>
    graph.nodes.find((node) => node.action?.kind === kind);
  assert.deepEqual(byKind("learn-spell").action, {
    kind: "learn-spell",
    spellId: "utevo-lux",
    price: 500,
    minimumLevel: 8,
    premium: false,
  });
  const travel = byKind("travel");
  const travelOffer = graph.travelOffers.find(
    (offer) => offer.id === travel.action.offerId,
  );
  assert.deepEqual(travelOffer.destination, { x: 100, y: 200, z: 7 });
  assert.equal(travelOffer.cost, 60);
  assert.equal(travelOffer.minimumLevel, 20);
  const kick = byKind("teleport");
  assert.equal(
    graph.travelOffers.find((offer) => offer.id === kick.action.offerId).cost,
    0,
  );
  assert.deepEqual(byKind("promote").action, {
    kind: "promote",
    cost: 20000,
    minimumLevel: 20,
  });
  assert.equal(
    graph.nodes.find((node) => node.matches[0]?.[0] === "leave").ungreet,
    true,
  );
  const gated = graph.nodes.find((node) => node.matches[0]?.[0] === "mission");
  assert.deepEqual(gated.conditions, [
    { kind: "storage", key: "Quest.Example.Line", operator: "eq", value: -1 },
  ]);
  assert.deepEqual(gated.effects, [
    { kind: "set-storage", key: "Quest.Example.Line", value: 1 },
  ]);
  assert.equal(result.report.unsupportedKeywordActions, 0);
});

test("reports rather than guesses when a command cannot be typed", () => {
  const result = parseCanaryNpcDialogues(
    [
      {
        typeId: "vague",
        path: "npc/vague.lua",
        source: `
local keywordHandler = KeywordHandler:new()
local npcHandler = NpcHandler:new(keywordHandler)
keywordHandler:addKeyword({ "spell" }, StdModule.learnSpell, { npcHandler = npcHandler, spellName = "Nonexistent", price = 100, level = 8 })
keywordHandler:addKeyword({ "trip" }, StdModule.travel, { npcHandler = npcHandler, destination = destinationFor(player), cost = 10 })
keywordHandler:addKeyword({ "hints" }, StdModule.rookgaardHints, { npcHandler = npcHandler })
keywordHandler:addKeyword({ "quest" }, StdModule.say, { npcHandler = npcHandler, text = "Ready?" }, function(player)
  return player:hasBlessing(1)
end)
keywordHandler:addKeyword({ "gift" }, StdModule.say, { npcHandler = npcHandler, text = "Take it." }, nil, function(player)
  player:addItem(2160, 1)
end)
npcHandler:addModule(FocusModule:new(), npcConfig.name, true, true, true)
`,
      },
    ],
    new Set(),
    { spellIdsByName: new Map() },
  );

  const reported = result.report.definitions[0].unsupportedKeywordActions;
  assert.equal(result.report.unsupportedKeywordActions, 5);
  assert.equal(result.dialogues[0].nodes.length, 1);
  assert.match(
    reported.find((entry) => entry.action === "StdModule.learnSpell")
      .sourceInvalid,
    /is not in the pinned catalog$/,
  );
  assert.equal(
    reported.find((entry) => entry.action === "StdModule.travel")
      .nonLiteralDestination,
    true,
  );
  assert.equal(
    reported.find((entry) => entry.action === "StdModule.rookgaardHints")
      .missingHintTable,
    true,
  );
  assert.equal(
    reported.find((entry) => entry.keywords[0] === "quest").callback,
    true,
  );
  assert.equal(
    reported.find((entry) => entry.keywords[0] === "gift").effectCallback,
    true,
  );
});
