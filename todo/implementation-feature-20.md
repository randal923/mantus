# Feature 20 — Exhaustive vocation coefficient fixtures

Part of [Todo 7 — Vocations, stats, and progression](todo-7.md).

## Why

Aggregate vocation-count checks and core Monk coefficient fixtures exist, but nothing proves that every pinned progression coefficient is either matched or explicitly marked non-gameplay. A generated exhaustive fixture closes that gap.

## Remaining work

- Generate an exhaustive fixture covering all remaining base coefficients (beyond the existing aggregate count and Monk fixtures).
- Delegated coefficient families: vocation PvP coefficients → Todo 15 (Feature 60); gem/Wheel coefficients → Todo 16 (Features 79–82, notably Feature 81).

## Implementation

- Generate a fixture from the pinned Canary vocation definitions into a test that asserts every coefficient in `/home/randal/code/tibia/server/src/progression/vocationDefinitions.ts` matches the fixture or is explicitly flagged non-gameplay.
- Extend suites in the style of `progressionCurves.test.ts`.

## Tests

- The generated-fixture test itself: any coefficient drift between `vocationDefinitions.ts` and pinned Canary fails; any unclassified coefficient fails.

## Dependencies

- Todo 15 (Feature 60) for PvP coefficients; Todo 16 (Features 79–82) for gem/Wheel coefficient families.
