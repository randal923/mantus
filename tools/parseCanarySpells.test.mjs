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
