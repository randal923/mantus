# Feature 23 — Advanced targeting and encounter interactions

Part of [Todo 8 — Combat, spells, and conditions](todo-8.md).

## Why

Pinned parity includes attack/follow, challenge/taunt, aim-at-target, boss difficulty, hazard, encounter, and combat-analyzer systems. Each must exist as bounded intents plus server-owned state — none of it client-computed.

## Remaining work

- Attack/follow mode as a bounded intent with server-owned follow state.
- Challenge/taunt affecting monster targeting.
- Aim-at-target support.
- Boss difficulty, hazard, and encounter systems.
- Combat analyzer with strictly visibility-scoped data.

## Implementation

- New bounded zod intents (schema + max size + rate expectation) in `protocol/` before any handler, per charter.
- Server state in `/home/randal/code/tibia/server/src/combat/`; follow builds on `/home/randal/code/tibia/server/src/combat/ChaseController.ts`; taunt/challenge affects monster targeting in `/home/randal/code/tibia/server/src/ai/MonsterBrain.ts`.
- All target/challenge ids re-validated at execution time in the tick (existence, visibility, attackability, floor), like existing attack-target intents.
- Canary references: challenge/taunt monster-targeting rules, boss difficulty and hazard systems, combat analyzer.

## Tests

- Forged challenge/follow ids never alter authoritative targeting.
- Analyzer data reveals nothing out-of-view (no hidden HP, no off-screen creatures).

## Dependencies

- Boss/hazard/encounter content interacts with Todo 16 (Feature 86 long tail and related systems).
