# Feature 28 — Spell-words-via-chat completion

Part of [Todo 8 — Combat, spells, and conditions](todo-8.md).

## Why

Spell words via chat shipped (`4b332a1`, extended by `2e25fa9`): exact match after case/whitespace normalization, parameter parsing (longest words prefix + remainder, optional quotes), full validation in the cast pipeline, and exani tera/exani hur as `worldAction` spells. It shipped with a recorded known-gaps list (2026-07-24) that this feature closes.

## Remaining work

- Name-parameterized casts (`exura sio "Friend"`) are parsed then dropped without a cast. Fix: resolve the parameter to an on-screen player and pass a `creature` target.
- Exani hur cannot be cast from the action bar or a bare `cast-spell` intent (no parameter carried; rejects `spell-not-possible`). Fix if wanted: an up/down chooser on the slot, or two pseudo-actions.
- Successful casts broadcast as plain `say`; there is no distinct magic/orange speech mode in the protocol.
- Yelled spell words do not cast (yell has its own exhaust path); say and whisper do.
- Spell-driven floor moves reuse the step cooldown (`player.nextStepAt`), so exani tera/exani hur can fizzle mid-step (no mana lost); Canary teleports immediately.

## Implementation

- Parameter resolution and cast dispatch in `/home/randal/code/tibia/server/src/combat/Combat.ts` (`castSpellByWords`, wired via `/home/randal/code/tibia/server/src/GameServer.ts:502` and `/home/randal/code/tibia/server/src/chat/ChatHandler.ts`) and `/home/randal/code/tibia/server/src/combat/SpellCaster.ts`; `creature`-target resolution must re-check visibility at execution time in the tick.
- Speech mode needs a protocol addition in `/home/randal/code/tibia/protocol/src/serverMessages.ts` (shared surface with Feature 21's creature speech).
- Step-cooldown decoupling in `/home/randal/code/tibia/server/src/MovementHandler.ts` and `/home/randal/code/tibia/server/src/world/MovementRules.ts` (the `WorldSpellHooks` executors in `/home/randal/code/tibia/server/src/combat/WorldSpellHooks.ts`); Canary levitate.lua/magic-rope semantics remain the reference, resources spent only on success.
- `cast-spell` parameter support needs a bounded optional parameter field added to the intent schema in `protocol/` (max length enforced) before the handler change.

## Tests

- Forged/oversized cast parameters rejected by schema and handler.
- Off-screen name targets never resolve to a cast (visibility re-checked at execution time).
- Exani tera/exani hur no longer fizzle against the step cooldown; no resource spent on a failed move.

## Dependencies

- Feature 21 (shared protocol surface for speech mode/creature speech).
