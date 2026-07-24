# Feature 18 — Stamina, soul rules, and training systems

Part of [Todo 7 — Vocations, stats, and progression](todo-7.md).

## Why

These are the remaining persistent progression modifiers after core XP/skills/vocations shipped. Stamina is explicitly required parity.

## Remaining work

- Stamina: persistence plus regeneration/logout rules.
- Exact soul eligibility rules.
- Offline training.
- Exercise training.
- Configurable skill stages/rates.
- Delegated: blessings/death-loss → Todo 9 (Feature 32); party-shared training modifiers → Todo 15 (Features 55–57); Wheel/animus modifiers → Todo 16 (Features 79–82).

## Implementation

- Extend `/home/randal/code/tibia/server/src/progression/CharacterProgression.ts` and `/home/randal/code/tibia/server/src/progression/ProgressionSystem.ts`.
- New curve/eligibility utilities alongside the existing pure helpers (`getSkillTriesForNextLevel.ts`, `getAccountRegeneration.ts`) — keep them pure and recomputable.
- Character table migration plus `CharacterStore` load/save additions for stamina/training state.
- Stamina decay/regen runs on the bounded tick schedule with the same five-overdue-intervals cap as regen/training, online-only; reconnect cannot manufacture offline ticks.
- Offline training needs durable last-logout state applied at login inside the load transaction (single ACID transaction, consistent with the login item-lock rule).
- Canary reference: stamina/offline-training/exercise-weapon rules and skill-stage config from the pinned checkout.

## Tests

- Reconnect cannot manufacture stamina or training ticks.
- Duplicate training events award exactly once (idempotent event ids).
- Stamina boundaries: green/orange thresholds and logout regeneration computed deterministically.

## Dependencies

- Todo 9 (Feature 32) for blessings/death-loss; Todo 15 (Features 55–57) for party-shared modifiers; Todo 16 (Features 79–82) for Wheel/animus modifiers.
- Overlaps Feature 72 (beds/stamina/blessings/training systems in Todo 16) — coordinate ownership of the bed-driven stamina/regen slice there.
