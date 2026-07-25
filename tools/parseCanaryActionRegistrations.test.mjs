import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCanaryActionRegistrations } from "./parseCanaryActionRegistrations.mjs";

const TOOL_LUA = `
local machete = Action()

function machete.onUse(player, item, fromPosition, target, toPosition, isHotkey)
	return onUseMachete(player, item, fromPosition, target, toPosition, isHotkey)
end

machete:id(3308)
machete:register()
`;

const TRAP_LUA = `
local traps = { [2145] = {}, [2148] = {} }

local trap = MoveEvent()
function trap.onStepIn(creature, item, position, fromPosition) end
trap:type("stepin")
for itemId, info in pairs(traps) do
	trap:id(itemId)
end
trap:register()

trap = MoveEvent()
function trap.onStepOut(creature, item, position, fromPosition) end
trap:type("stepout")
trap:id(2146, 3945)
trap:register()
`;

const QUEST_LUA = `
-- a commented out registration must not count
--[[
local ghost = Action()
ghost:uid(1234)
ghost:register()
]]
local chest = Action()
function chest.onUse() end
chest:uid(5000)
chest:uid(5001)
chest:register()

local plate = MoveEvent()
function plate.onStepIn() end
plate:type("stepin")
plate:position(Position(32219, 32401, 10))
plate:register()
`;

test("parses one registration with its item ids", () => {
  const [registration, ...rest] = parseCanaryActionRegistrations(
    "data/scripts/actions/tools/machete.lua",
    TOOL_LUA,
  );
  assert.equal(rest.length, 0);
  assert.equal(registration.kind, "action");
  assert.deepEqual(registration.ids, [3308]);
  assert.equal(registration.dynamicSelectors, false);
});

test("splits a reassigned local into separate registrations", () => {
  const registrations = parseCanaryActionRegistrations(
    "data/scripts/movements/trap.lua",
    TRAP_LUA,
  );
  assert.equal(registrations.length, 2);
  const [stepIn, stepOut] = registrations;
  assert.equal(stepIn.moveEventType, "stepin");
  // Ids built from a runtime loop cannot be resolved statically.
  assert.equal(stepIn.dynamicSelectors, true);
  assert.deepEqual(stepIn.ids, []);
  assert.equal(stepOut.moveEventType, "stepout");
  assert.deepEqual(stepOut.ids, [2146, 3945]);
  assert.equal(stepOut.dynamicSelectors, false);
});

test("records unique-id and position selectors, ignoring commented code", () => {
  const registrations = parseCanaryActionRegistrations(
    "data-otservbr-global/scripts/actions/system/quest_reward_common.lua",
    QUEST_LUA,
  );
  assert.equal(registrations.length, 2);
  assert.deepEqual(registrations[0].uids, [5000, 5001]);
  assert.equal(registrations[1].positionCount, 1);
});
