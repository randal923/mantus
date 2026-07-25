# Feature 18 — Stamina, soul rules, and training systems

Part of [Todo 7 — Vocations, stats, and progression](todo-7.md).

## Why

These are the remaining persistent progression modifiers after core XP/skills/vocations shipped. Stamina is explicitly required parity.

## Status

Rules layer shipped 2026-07-24 — see
[completed log](completed/implementation-feature-18-completed.md).

Done (fully wired + tested):

- Stamina: persistence (`stamina`/`last_seen_at` columns), offline regen,
  hunt-driven online decay, green/orange/premium XP multiplier, client
  projection. Offline anchor is the server-clock `last_seen_at`; a forced
  logout save prevents idle-relog stamina minting.
- Exact soul eligibility: armed by qualifying kills (exp ≥ level), suspended
  in protection zones, 4-minute window, no longer always-on.
- Configurable skill/magic/exp stages (`progression.useStages`) + rate knobs
  (`rates.soulRegen`/`offlineTraining`/`exerciseTraining`) in `config.yml`.
- Offline-training and exercise-training **conversion engines** (pure,
  parity-correct, unit-tested).

## Remaining work (delegated to Feature 72 — shared bed/statue/dummy substrate)

- Offline training **in-world**: durable offline-training bar column, statue
  trigger that selects the skill + logs out, and the transactional login
  conversion (apply `computeOfflineTraining` inside the load transaction).
- Exercise training **in-world**: exercise-weapon/dummy action loop —
  charge-consuming, PZ-gated, exhausted, scheduled ticks calling
  `computeExerciseTrainingGain`.
- These reuse `server/src/progression/offlineTraining.ts` and
  `exerciseTraining.ts`; do not re-derive the math. See
  [implementation-feature-72.md](implementation-feature-72.md).
- Delegated (unchanged): blessings/death-loss → Todo 9 (Feature 32);
  party-shared training modifiers → Todo 15 (Features 55–57); Wheel/animus
  modifiers → Todo 16 (Features 79–82).

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
