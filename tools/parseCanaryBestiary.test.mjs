import assert from "node:assert/strict";
import test from "node:test";
import { parseCanaryBestiary } from "./parseCanaryBestiary.mjs";

const bestiaryLua = `
local mType = Game.createMonsterType("Test Rat")
local monster = {}
monster.raceId = 21
monster.Bestiary = {
	class = "Mammal",
	race = BESTY_RACE_MAMMAL,
	toKill = 250,
	FirstUnlock = 10,
	SecondUnlock = 100,
	CharmsPoints = 5,
	Stars = 1,
	Occurrence = 0,
	Locations = "Rookgaard and Mainland, \\"everywhere\\".",
}
mType:register(monster)
`;

const bossLua = `
local mType = Game.createMonsterType("Test Boss")
local monster = {}
monster.bosstiary = {
	bossRaceId = 670,
	bossRace = RARITY_BANE,
}
mType:register(monster)
`;

test("parses a bestiary block", () => {
  const result = parseCanaryBestiary(bestiaryLua, "mammals/test_rat.lua");
  assert.equal(result.name, "Test Rat");
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.bestiary, {
    raceId: 21,
    class: "Mammal",
    stars: 1,
    occurrence: 0,
    charmPoints: 5,
    firstUnlock: 10,
    secondUnlock: 100,
    toKill: 250,
    locations: 'Rookgaard and Mainland, "everywhere".',
  });
  assert.equal(result.bosstiary, null);
});

test("parses a bosstiary block", () => {
  const result = parseCanaryBestiary(bossLua, "bosses/test_boss.lua");
  assert.equal(result.name, "Test Boss");
  assert.deepEqual(result.warnings, []);
  assert.equal(result.bestiary, null);
  assert.deepEqual(result.bosstiary, { raceId: 670, category: "bane" });
});

test("warns on bestiary block without raceId", () => {
  const lua = bestiaryLua.replace("monster.raceId = 21\n", "");
  const result = parseCanaryBestiary(lua, "undeads/crypt_warrior.lua");
  assert.equal(result.bestiary, null);
  assert.deepEqual(result.warnings, [
    "undeads/crypt_warrior.lua: Bestiary block without monster.raceId",
  ]);
});

test("warns on non-increasing kill thresholds", () => {
  const lua = bestiaryLua.replace("SecondUnlock = 100", "SecondUnlock = 5");
  const result = parseCanaryBestiary(lua, "mammals/test_rat.lua");
  assert.equal(result.bestiary, null);
  assert.deepEqual(result.warnings, [
    "mammals/test_rat.lua: non-increasing Bestiary kill thresholds",
  ]);
});

test("warns on unknown bestiary class", () => {
  const lua = bestiaryLua.replace('class = "Mammal"', 'class = "Rodent"');
  const result = parseCanaryBestiary(lua, "mammals/test_rat.lua");
  assert.equal(result.bestiary, null);
  assert.deepEqual(result.warnings, [
    "mammals/test_rat.lua: incomplete Bestiary block",
  ]);
});

test("warns on bosstiary block with unknown rarity", () => {
  const lua = bossLua.replace("RARITY_BANE", "RARITY_MYTHIC");
  const result = parseCanaryBestiary(lua, "bosses/test_boss.lua");
  assert.equal(result.bosstiary, null);
  assert.deepEqual(result.warnings, [
    "bosses/test_boss.lua: incomplete bosstiary block",
  ]);
});

test("returns nulls for non-monster lua", () => {
  const result = parseCanaryBestiary("local x = 1", "misc.lua");
  assert.equal(result.name, null);
  assert.equal(result.bestiary, null);
  assert.equal(result.bosstiary, null);
});
