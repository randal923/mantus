import assert from "node:assert/strict";
import test from "node:test";
import { parseCanaryMonsterSpells } from "./parseCanaryMonsterSpells.mjs";

function parse(name, source, constants = {}, areas = {}) {
  return parseCanaryMonsterSpells(
    [{ path: `monster/${name}.lua`, source }],
    constants,
    areas,
  )[0];
}

test("parses registered chain targeting and visuals", () => {
  const spell = parse(
    "energy_chain",
    `
      local combat = Combat()
      combat:setParameter(COMBAT_PARAM_TYPE, COMBAT_ENERGYDAMAGE)
      combat:setParameter(COMBAT_PARAM_EFFECT, CONST_ME_ENERGYHIT)
      combat:setParameter(COMBAT_PARAM_CHAIN_EFFECT, CONST_ME_PINK_ENERGY_SPARK)
      function getChainValue()
        return 2, 3, false
      end
      combat:setCallback(CALLBACK_PARAM_CHAINVALUE, "getChainValue")
      local spell = Spell("instant")
      spell:name("energy chain")
      spell:isSelfTarget(true)
      spell:register()
    `,
    { CONST_ME_ENERGYHIT: 12, CONST_ME_PINK_ENERGY_SPARK: 179 },
  );

  assert.equal(spell.supported, true);
  assert.equal(spell.behavior.damageType, "energy");
  assert.equal(spell.behavior.target, "self");
  assert.equal(spell.behavior.effect, 12);
  assert.deepEqual(spell.behavior.chain, {
    additionalTargets: 2,
    range: 3,
    backtracking: false,
    effect: 179,
    playersOnly: false,
  });
});

test("prefers local areas over shared constants and retains diagonal geometry", () => {
  const spell = parse(
    "custom_wave",
    `
      local combat = Combat()
      local AREA_WAVE4 = {
        { 1, 1, 1 },
        { 0, 3, 0 },
      }
      combat:setArea(createCombatArea(AREA_WAVE4, AREADIAGONAL_WAVE4))
      local spell = Spell("instant")
      spell:name("custom wave")
      spell:needDirection(true)
      spell:register()
    `,
    {},
    {
      AREA_WAVE4: [{ x: 99, y: 99 }],
      AREADIAGONAL_WAVE4: [{ x: -1, y: -1 }, { x: 0, y: 0 }],
    },
  );

  assert.deepEqual(spell.behavior.area, {
    shape: "tiles",
    offsets: [
      { x: -1, y: -1 },
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: 0, y: 0 },
    ],
    diagonalOffsets: [{ x: -1, y: -1 }, { x: 0, y: 0 }],
    directional: true,
  });
});

test("targets attacked creatures for registered runes and target-or-direction spells", () => {
  const rune = parse(
    "test_rune",
    `
      local combat = Combat()
      combat:setParameter(COMBAT_PARAM_TYPE, COMBAT_EARTHDAMAGE)
      local rune = Spell("rune")
      rune:name("test rune")
      rune:register()
    `,
  );
  const strike = parse(
    "test_strike",
    `
      local combat = Combat()
      combat:setParameter(COMBAT_PARAM_TYPE, COMBAT_ENERGYDAMAGE)
      local spell = Spell("instant")
      spell:name("test strike")
      spell:needCasterTargetOrDirection(true)
      spell:register()
    `,
  );

  assert.equal(rune.behavior.target, "target");
  assert.equal(strike.behavior.target, "target");
});

test("parses bounded random reducers and progressive damage ticks", () => {
  const spell = parse(
    "skill_reducer",
    `
      local combat = Combat()
      for i = 40, 70 do
        local reducer = Condition(CONDITION_ATTRIBUTES)
        reducer:setParameter(CONDITION_PARAM_TICKS, 6000)
        reducer:setParameter(CONDITION_PARAM_SKILL_MELEEPERCENT, i)
        combat:addCondition(reducer)
      end
      for j = 10, 20 do
        local poison = Condition(CONDITION_POISON)
        poison:addDamage(1, 2000, -damage)
        local damage = j
        damage = damage * 2
        combat:addCondition(poison)
      end
      local spell = Spell("instant")
      spell:name("test reducer")
      spell:register()
    `,
  );

  assert.equal(spell.supported, true);
  assert.deepEqual(spell.behavior.conditions[0], {
    type: "attributes",
    durationMs: 6000,
    attributes: {
      meleePercent: { minimum: 40, maximum: 70 },
    },
  });
  assert.deepEqual(spell.behavior.conditions[1].tickDamage, {
    damageType: "earth",
    intervalMs: 2000,
    count: 1,
    minimum: 10,
    maximum: 20,
    multiplier: 2,
  });
});

test("keeps unreviewed delayed quest mutations disabled", () => {
  const spell = parse(
    "unsafe_callback",
    `
      local spell = Spell("instant")
      function spell.onCastSpell(creature)
        addEvent(function()
          creature:teleportTo({ x = 1, y = 2, z = 3 })
        end, 1000)
      end
      spell:name("unsafe callback")
      spell:register()
    `,
  );

  assert.equal(spell.supported, false);
  assert.deepEqual(spell.unsupportedReasons, [
    "spell has no imported gameplay operation",
    "unreviewed delayed callback",
    "unreviewed quest mutation",
  ]);
});
