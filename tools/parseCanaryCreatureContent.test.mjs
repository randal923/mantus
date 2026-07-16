import assert from "node:assert/strict";
import test from "node:test";
import { parseCanaryCreatureContent } from "./parseCanaryCreatureContent.mjs";

const monsterLua = `
local mType = Game.createMonsterType("Test Rat")
local monster = {}
monster.description = "a test rat"
monster.experience = 5
monster.outfit = { lookType = 21 }
monster.health = 20
monster.maxHealth = 20
monster.corpse = 5964
monster.speed = 67
monster.strategiesTarget = { nearest = 100 }
monster.flags = { attackable = true, hostile = true, pushable = true, targetDistance = 1, runHealth = 5 }
monster.attacks = { { name = "melee", interval = 2000, chance = 100, maxDamage = -8 } }
monster.defenses = { defense = 5, armor = 1 }
monster.elements = { { type = COMBAT_EARTHDAMAGE, percent = 20 } }
monster.immunities = { { type = "paralyze", condition = true } }
monster.summons = {}
monster.voices = { interval = 5000, chance = 10, { text = "Meep!", yell = false } }
monster.loot = { { name = "gold coin", chance = 100000, maxCount = 4 } }
mType:register(monster)
`;

const spawnXml = `<?xml version="1.0"?>
<monsters>
  <monster centerx="100" centery="200" centerz="7" radius="3">
    <monster name="Test Rat" x="-2" y="4" z="7" spawntime="10" direction="1" />
  </monster>
</monsters>`;

const parse = (xml = spawnXml) =>
  parseCanaryCreatureContent({
    monsterSpawnXml: xml,
    npcSpawnXml: "<npcs></npcs>",
    monsterDefinitions: [{ path: "monster/test_rat.lua", source: monsterLua }],
    npcDefinitions: [],
    bounds: { centerX: 100, centerY: 200, z: 7, radius: 10 },
    tileAt: () => "walkable",
  });

test("resolves spawn offsets, centerz, direction, and static type data", () => {
  const result = parse();
  assert.deepEqual(result.slots[0].home, { x: 98, y: 204, z: 7 });
  assert.equal(result.slots[0].direction, "east");
  assert.equal(result.slots[0].respawnMs, 10_000);
  assert.equal(result.monsterTypes[0].outfit.lookType, 21);
  assert.equal(result.monsterTypes[0].flags.hostile, true);
  assert.deepEqual(result.monsterTypes[0].immunities, ["paralyze"]);
});

test("fails when a curated placement has no unambiguous static type", () => {
  assert.throws(
    () => parse(spawnXml.replace("Test Rat", "Missing Rat")),
    /references unknown type Missing Rat/,
  );
});

test("fails rather than guessing when a child floor disagrees with centerz", () => {
  assert.throws(
    () => parse(spawnXml.replace('y="4" z="7"', 'y="4" z="6"')),
    /floor does not match centerz/,
  );
});

test("resolves NPC type aliases and punctuation-only names safely", () => {
  const npcSpawnXml = `<npcs>
    <npc centerx="100" centery="100" centerz="7" radius="2">
      <npc name="Corym Worker (3)" x="0" y="0" z="7" spawntime="60" />
    </npc>
    <npc centerx="110" centery="100" centerz="7" radius="2">
      <npc name="..." x="0" y="0" z="7" spawntime="60" />
    </npc>
  </npcs>`;
  const npcDefinitions = [
    {
      path: "npc/corym_worker_03.lua",
      source: `
        local internalNpcName = "Corym Worker"
        local npcType = Game.createNpcType("Corym Worker (3)")
        local npcConfig = {}
        npcConfig.health = 100
        npcConfig.maxHealth = 100
        npcConfig.walkInterval = 2000
        npcConfig.walkRadius = 2
        npcConfig.outfit = { lookType = 533 }
      `,
    },
    {
      path: "npc/....lua",
      source: `
        local npcType = Game.createNpcType("...")
        local npcConfig = {}
        npcConfig.health = 100
        npcConfig.maxHealth = 100
        npcConfig.walkInterval = 1500
        npcConfig.walkRadius = 2
        npcConfig.outfit = { lookType = 294 }
      `,
    },
  ];
  const result = parseCanaryCreatureContent({
    monsterSpawnXml: "<monsters></monsters>",
    npcSpawnXml,
    monsterDefinitions: [],
    npcDefinitions,
    bounds: null,
    tileAt: () => "walkable",
  });

  assert.deepEqual(
    result.npcTypes.map((type) => type.id),
    ["corym-worker-3", "symbol-2e-2e-2e"],
  );
  assert.deepEqual(
    result.slots.map((slot) => slot.typeId),
    ["corym-worker-3", "symbol-2e-2e-2e"],
  );
});

test("records the pinned Hagor palette correction", () => {
  const result = parseCanaryCreatureContent({
    monsterSpawnXml: "<monsters></monsters>",
    npcSpawnXml: `<npcs>
      <npc centerx="100" centery="100" centerz="7" radius="2">
        <npc name="Hagor" x="0" y="0" z="7" spawntime="60" />
      </npc>
    </npcs>`,
    monsterDefinitions: [],
    npcDefinitions: [{
      path: "npc/hagor.lua",
      source: `
        local internalNpcName = "Hagor"
        local npcConfig = {}
        npcConfig.health = 100
        npcConfig.maxHealth = 100
        npcConfig.walkInterval = 2000
        npcConfig.walkRadius = 2
        npcConfig.outfit = { lookType = 129, lookFeet = 1156 }
      `,
    }],
    bounds: null,
    tileAt: () => "walkable",
  });

  assert.equal(result.npcTypes[0].outfit.feet, 115);
  assert.deepEqual(result.report.appearanceCorrections, [{
    kind: "npc",
    typeId: "hagor",
    sourcePath: "npc/hagor.lua",
    field: "feet",
    sourceValue: 1156,
    importedValue: 115,
    reason: "Pinned Canary value exceeds the Tibia outfit palette.",
  }]);
});
