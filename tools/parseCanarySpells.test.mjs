import assert from "node:assert/strict";
import test from "node:test";
import { parseCanarySpells } from "./parseCanarySpells.mjs";

test("parses literal Canary spell metadata and formula without executing Lua", () => {
  const source = `
local combat = Combat()
combat:setParameter(COMBAT_PARAM_TYPE, COMBAT_ENERGYDAMAGE)
combat:setParameter(COMBAT_PARAM_EFFECT, CONST_ME_ENERGYAREA)
combat:setParameter(COMBAT_PARAM_DISTANCEEFFECT, CONST_ANI_ENERGY)

function onGetFormulaValues(player, level, maglevel)
  local min = (level / 5) + (maglevel * 0.4) + 3
  local max = (level / 5) + (maglevel * 0.7) + 5
  return -min, -max
end

combat:setCallback(CALLBACK_PARAM_LEVELMAGICVALUE, "onGetFormulaValues")
local spell = Spell("instant")
function spell.onCastSpell(creature, var)
  return combat:execute(creature, var)
end
spell:group("attack")
spell:id(177)
spell:name("Buzz")
spell:words("exori infir vis")
spell:level(1)
spell:mana(6)
spell:range(3)
spell:needCasterTargetOrDirection(true)
spell:blockWalls(true)
spell:cooldown(2 * 1000)
spell:groupCooldown(2 * 1000)
spell:vocation("sorcerer;true", "master sorcerer;true")
spell:register()
`;
  const [spell] = parseCanarySpells(
    [{ path: "data/scripts/spells/attack/buzz.lua", source }],
    { CONST_ME_ENERGYAREA: 38, CONST_ANI_ENERGY: 5 },
  );

  assert.equal(spell.name, "Buzz");
  assert.equal(spell.id, "exori-infir-vis");
  assert.equal(spell.cooldownMs, 2_000);
  assert.equal(spell.groupCooldownMs[0], 2_000);
  assert.equal(spell.targetKind, "target-or-direction");
  assert.equal(spell.combat.damageType, "energy");
  assert.equal(spell.combat.effectId, 38);
  assert.equal(spell.combat.missileId, 5);
  assert.equal(spell.supported, true);
});

test("reports procedural definitions instead of evaluating them", () => {
  const source = `
local spell = Spell("instant")
function spell.onCastSpell(creature, var)
  return Game.createItem(1234, 1, creature:getPosition())
end
spell:name("Unsafe Example")
spell:register()
`;
  const [spell] = parseCanarySpells([
    { path: "data/scripts/spells/support/unsafe.lua", source },
  ]);

  assert.equal(spell.supported, false);
  assert.ok(spell.unsupportedReasons.includes("procedural cast callback"));
});

/**
 * Canary's `createCombatArea(area, extArea)`: the second table is the matrix
 * used for diagonal casts. Both must survive as typed offsets, anchored on
 * the `2`/`3` centre cell, with only `1`/`3` cells counted as affected.
 */
test("imports custom tile matrices and their diagonal counterpart", () => {
  const source = `
local combat = Combat()
combat:setParameter(COMBAT_PARAM_TYPE, COMBAT_FIREDAMAGE)
combat:setArea(createCombatArea(AREA_TEST, AREADIAGONAL_TEST))
combat:setFormula(COMBAT_FORMULA_DAMAGE, -5, 0, -9, 0)
local spell = Spell("instant")
function spell.onCastSpell(creature, var)
  return combat:execute(creature, var)
end
spell:name("Test Wave")
spell:words("exevo test")
spell:needDirection(true)
spell:register()
`;
  const [spell] = parseCanarySpells(
    [{ path: "data/scripts/spells/attack/test_wave.lua", source }],
    {},
    {
      AREA_TEST: [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }],
      AREADIAGONAL_TEST: [{ x: 0, y: 0 }, { x: -1, y: 1 }],
    },
  );

  assert.equal(spell.supported, true);
  assert.deepEqual(spell.combat.area, {
    shape: "tiles",
    offsets: [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }],
    diagonalOffsets: [{ x: 0, y: 0 }, { x: -1, y: 1 }],
    directional: true,
  });
  assert.deepEqual(spell.ignoredFormulaFields, []);
});

/**
 * Wheel-upgraded spells build their combat in a local helper and call it once
 * per grade. The catalog models the base grade, which is the first call.
 */
test("resolves an area passed into a local combat helper", () => {
  const source = `
local function createCombat(area, combatFunc)
  local initCombat = Combat()
  initCombat:setCallback(CALLBACK_PARAM_LEVELMAGICVALUE, combatFunc)
  initCombat:setParameter(COMBAT_PARAM_TYPE, COMBAT_ENERGYDAMAGE)
  initCombat:setArea(createCombatArea(area))
  return initCombat
end

local combat = createCombat(AREA_BASE, "onGetFormulaValues")
local combatWOD = createCombat(AREA_UPGRADED, "onGetFormulaValues")
local spell = Spell("instant")
spell:name("Test Beam")
spell:needDirection(true)
spell:register()
`;
  const [spell] = parseCanarySpells(
    [{ path: "data/scripts/spells/attack/test_beam.lua", source }],
    {},
    {
      AREA_BASE: [{ x: 0, y: 0 }],
      AREA_UPGRADED: [{ x: 0, y: 0 }, { x: 0, y: -1 }],
    },
  );

  assert.deepEqual(spell.combat, null);
  assert.ok(!spell.unsupportedReasons.includes("dynamic combat area"));
});

test("reports an area it cannot resolve instead of approximating it", () => {
  const source = `
local combat = Combat()
combat:setParameter(COMBAT_PARAM_TYPE, COMBAT_FIREDAMAGE)
combat:setArea(createCombatArea(AREA_UNKNOWN))
combat:setFormula(COMBAT_FORMULA_DAMAGE, -5, 0, -9, 0)
local spell = Spell("instant")
function spell.onCastSpell(creature, var)
  return combat:execute(creature, var)
end
spell:name("Test Unknown")
spell:register()
`;
  const [spell] = parseCanarySpells([
    { path: "data/scripts/spells/attack/test_unknown.lua", source },
  ]);

  assert.equal(spell.supported, false);
  assert.ok(
    spell.unsupportedReasons.includes("unsupported combat area AREA_UNKNOWN"),
  );
});

test("imports literal conjuring inputs without executing the callback", () => {
  const source = `
local spell = Spell("instant")
function spell.onCastSpell(creature, variant)
  return creature:conjureItem(3147, 3155, 3)
end
spell:name("Sudden Death Rune")
spell:words("adori vita vis")
spell:group("support")
spell:mana(985)
spell:soul(5)
spell:register()
`;
  const [spell] = parseCanarySpells([
    {
      path: "data/scripts/spells/conjuring/sudden_death_rune.lua",
      source,
    },
  ]);

  assert.equal(spell.supported, true);
  assert.deepEqual(spell.conjure, {
    sourceItemTypeId: 3147,
    targetItemTypeId: 3155,
    count: 3,
  });
});
