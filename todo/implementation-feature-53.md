# Feature 53 — World-action parity inventory

Part of [Todo 13 — Typed world actions](todo-13.md).

## Why
Individual handlers have shipped against known Canary behaviors, but there is no exhaustive accounting of every pinned Canary action/movement/creature-event registration, so silently-ignored interactions can hide indefinitely.

## Remaining work
- Inventory every pinned Canary action, movement, and creature-event registration.
- Produce a parity report reaching zero unsupported/silently-ignored entries.

## Implementation
- Generator in `tools/` in the classify-everything report style: every entry classified as implemented / deferred-to-quest-storage / explicitly-excluded — never silently dropped. It scans the pinned Canary `data/scripts` action and movement registrations.
- The report is consumed by a test that fails on any unclassified entry, so new Canary-side registrations or local regressions surface in CI rather than in play.

## Tests
- The parity test fails when an entry is unclassified; passes only when every registration has an explicit disposition.

## Dependencies
- Features 50-52 (handler coverage determines the "implemented" column).
- Feature 103/105 (quest storage platform) for the deferred-to-storage classification.
