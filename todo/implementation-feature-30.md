# Feature 30 — World-container and loot UX completions

Part of [Todo 9 — Death, corpses, loot, and decay](todo-9.md).

## Why
The v1 corpse-loot slice deliberately deferred several world-container affordances. They are UX completions, but each one touches reach-checked server views and must keep the per-tick re-validation model intact.

## Remaining work
- Nested world containers currently open only by taking the whole bag — no in-place browsing of a container inside a corpse/world container.
- Pristine seeded map chests (never-materialized world items from map data) are not openable via `use-map`.
- Only one open world container per session.
- No quick-loot / loot-all affordance.
- All of the above are deferred v1 scope, not bugs; the current single-view, direct-child-only model was intentional.

## Implementation
- Extend `server/src/item/WorldContainerViews.ts` to support multiple views per session and nested container views, keeping per-tick reach re-validation and viewer reconciliation on every mutation.
- Extend the `use-map` path in `server/src/item/ItemIntentHandler.ts`; pristine map chests need materialize-on-open from seeded map data (first touch creates the memory-first item, same unpersisted-loot invariant as corpses — see Feature 31).
- Quick-loot eligibility data comes from Feature 29's import; the quick-loot intent itself needs a zod schema in `protocol/` with max size and rate expectation before the handler exists (charter: new packets).
- All moves remain single atomic operations planned in-memory and persisted in one transaction (`planLoot`-style expected-version guards).

## Tests
- Tests alongside `server/src/item/ItemIntentHandler.loot.test.ts`: nested-view reach revocation, two players racing a nested item leave exactly one item, materialize-on-open cannot duplicate a chest's contents under concurrent opens or across restart.
- Stale-revision, out-of-reach, and non-owner rejections still enforced for nested views.

## Dependencies
- Feature 29 for quick-loot eligibility flags.
- Feature 31's unpersisted-item invariant work (materialize-on-open widens the memory-first surface).
