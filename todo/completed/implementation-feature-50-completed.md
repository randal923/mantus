# Feature 50 — completed sub-work

Remaining world-action kinds, from
[implementation-feature-50.md](../implementation-feature-50.md). The feature
stays **open**: only the teleport exploit-test box was closed in this pass.
Chests, pressure plates and fields are still not started.

Cross-links: [implementation-feature-50.md](../implementation-feature-50.md) ·
[todo-13.md](../todo-13.md).

---

## 2026-07-25 — Teleport coherence under simultaneous users

**Problem.** The exploit-test matrix for teleports was recorded as half-done:
"state coherent for simultaneous users" was waiting on teleport work.

**What was found.** Step-on teleports already work — `convertOtbm` emits them
as `MapTransition { kind: "teleport", activation: "step" }`, and
`MovementRules` resolves a step onto the source tile to the destination before
the occupancy and walkability checks. The missing piece was not code but the
proof that two players cannot desynchronise the tile.

**What changed.** `server/src/World.test.ts` gains a case where two players
step onto the same teleport tile in the same tick. It pins the whole coherent
outcome: exactly one lands on the destination, the other is refused rather than
stacked, the source tile is left clear, neither player ends up in a half-moved
state, and once the destination clears the second player teleports normally.
The property holds because the transition resolves *before* the occupancy
check, so the destination is the tile that gets contended — not the source.

**Files touched.** `server/src/World.test.ts`.

**Verification.** `vitest run src/World.test.ts` — 42 passed. Full suites:
`vitest run` 963 passed, `test:integration` 203 passed.

**Explicitly not done in this pass.** Repeatable chests, pressure plates and
fields were not started; the dropdown deviations are unresolved. Their plans
are in [implementation-feature-50.md](../implementation-feature-50.md), and
fields are additionally blocked on content — the pinned item catalog imports
`kind: "magicfield"` for 45 types but no `field` payload at all, so there is
nothing to drive damage from yet.

---

## 2026-07-25 — Chests, pressure plates, and traps

**Problem.** Three whole action kinds were unimplemented: repeatable/quest
chests, pressure plates, and fields.

**What changed.**

*Chests.* `tools/parseCanaryChestTables.mjs` +
`tools/importCanaryChests.mjs` (`yarn chests:import`) parse Canary's
`ChestUnique` startup table and `storages.lua` into
`content/items/canary-chests.json` and `server/data/chests.json`: 344 placed
chests imported, 45 classified (43 deferred to their own quest scripts because
they fall outside `quest_reward_common.lua`'s registered uid ranges, 2 excluded
— one whose `storage = keyAction` reads a nil global in Canary too, one an
identical duplicate placement). `loadChestDefinitions.ts` keys them by tile
position, matching Canary's startup stamping, so no map-data change was needed.

`ChestService` decides the reward inside the tick (`WorldActionRng` picks the
`randomReward` entry) and `PgChestStore` grants it: the first statement of the
transaction claims the character's `character_chest_loot` gate
(`INSERT … ON CONFLICT DO UPDATE … WHERE available_at <= now()`), so a replay,
a retry, or two racing uses produce exactly one grant. Bagged rewards land in a
freshly granted container. Migration `043_chest_loot.sql` adds the table and the
`chest-loot` audit type. Chest use is offered *before* the generic
container-open path in `GameServer`, mirroring Canary's unique-id precedence.

*Pressure plates and traps.* `PressurePlateRegistry` implements
`data/scripts/movements/special_tiles.lua` and `trap.lua`: depress/release
transforms, the `actionId >= 1000` level gate with snap-back (the storage-gated
variant fails closed), spike/earth traps with server-rolled damage through a new
`Combat.applyTileTrapDamage`, the protection-zone skip and the stacked-trap
skip. Wired to `MovementHandler`'s step hook, so every effect runs in the tick.

**Files touched.** `tools/parseCanaryChestTables.mjs`,
`tools/importCanaryChests.mjs`, `content/items/canary-chests.json`,
`server/data/chests.json`, `server/db/migrations/043_chest_loot.sql`,
`server/src/action/{ChestDefinition,loadChestDefinitions,handleChestUse,WorldActionRng,PressurePlateRegistry,pressurePlateTables}.ts`,
`server/src/chest/*`, `server/src/action/{WorldAction,WorldActionContext,WorldActionRegistry,resolveWorldAction}.ts`,
`server/src/{GameServer,MovementHandler,index}.ts`, `server/src/combat/Combat.ts`.

**How it was verified.** `tools/parseCanaryChestTables.test.mjs` (4),
`server/src/chest/ChestService.test.ts` (8),
`server/src/action/PressurePlateRegistry.test.ts` (8), and six chest cases in
`WorldActionRegistry.test.ts` covering the forgery matrix (forged position,
wrong item type, out of reach, out of view, non-chest fall-through).
`PgChestStore.integration.test.ts` covers the durable gate (replay, paired
keys, cooldown, racing uses, bagged rewards, no-space rollback) and is
registered in `yarn workspace server test:integration`; it needs a Postgres and
was not run in this pass.

**Residual risk.** Fields remain blocked on content (see `TODO.md`). Using a
sprung trap to disarm it (`data-otservbr-global/scripts/actions/other/trap.lua`)
is not wired and is recorded as deferred in the world-action parity report.
