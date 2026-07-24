# Feature 75 — Hunting tasks

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
Hunting tasks (Tasker) give kill goals with rewards and points — and those points are one of the Wheel's extra point sources (Feature 80), so this blocks full Wheel parity.

## Remaining work
- Task slots, kill goals, rewards, hunting-task points.
- Feed hunting-task points into Wheel point sources.

## Implementation
- Kill-count tracking off the same death hooks as bestiary (the `server/src/bestiary/BestiaryHooks.ts` pattern), so credit rules stay consistent.
- Durable task state (migration + store); reward grants in single transactions with audit for economy-relevant rewards.
- Bounded task select/reroll/claim intents in `protocol/` with execution-time re-checks (goal actually met, reward not already claimed).

## Tests
- Claim races cannot double-grant rewards.
- Kill credit follows the server death path only; forged progress impossible.

## Dependencies
- Bestiary hooks (shipped).
- Feeds Feature 80 (Wheel point sources).
