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
