# Feature 23 — Advanced targeting and encounter interactions

Part of [Todo 8 — Combat, spells, and conditions](todo-8.md).

Shipped so far (2026-07-25): follow, challenge/taunt, aim-at-target and the
combat analyzer — see the
[completed log](completed/implementation-feature-23-completed.md).

## Why

Pinned parity includes attack/follow, challenge/taunt, aim-at-target, boss
difficulty, hazard, encounter, and combat-analyzer systems. Each must exist as
bounded intents plus server-owned state — none of it client-computed.

## Remaining work

- Boss difficulty, hazard levels, and encounter systems. These are the same
  systems Todo 16 [Feature 86](implementation-feature-86.md) already owns
  ("hazard levels", "encounter/boss difficulty selection"), and they are
  content-scoped rather than targeting-scoped: build them there, from the
  Feature 89 parity inventory, and close this bullet when they land.
- Client surfaces for the shipped server halves: a combat-analyzer panel
  (`combat-analyzer` / `reset-combat-analyzer` are already in the protocol)
  and an aim-at-target toggle in the spell list (`set-aim-at-target-spells`
  is already in the protocol and persisted per character).
- Reward-boss guard for challenge and melee-pull. Canary refuses both for
  `isRewardBoss` monsters; this server has no reward-boss flag on
  `MonsterType` (the importer does not read `monster.isRewardBoss`), so only
  the summon guard is enforced today. Add the flag in the creature-content
  importer, then gate `challengeMonster` / `pullMonsterToMelee` on it.

## Implementation

- New bounded zod intents (schema + max size + rate expectation) in
  `protocol/` before any handler, per charter.
- Server state in `server/src/combat/`; follow builds on
  `server/src/combat/ChaseController.ts`; taunt/challenge affects monster
  targeting in `server/src/ai/MonsterBrain.ts` through
  `server/src/combat/TargetingHooks.ts` (implemented by `SpawnManager`).
- All target/challenge ids re-validated at execution time in the tick
  (existence, visibility, attackability, floor), like existing attack-target
  intents.
- Canary references: challenge/taunt monster-targeting rules
  (`Monster::challengeCreature`, `Monster::changeTargetDistance`), boss
  difficulty and hazard systems, combat analyzer (`PartyAnalyzer`).

## Tests

- Forged challenge/follow ids never alter authoritative targeting. ✅
- Analyzer data reveals nothing out-of-view (no hidden HP, no off-screen
  creatures). ✅
- Reward bosses cannot be challenged or pulled into melee. ⬜

## Dependencies

- Boss/hazard/encounter content interacts with Todo 16 (Feature 86 long tail
  and related systems).
- The reward-boss guard needs the creature-content importer to carry
  `isRewardBoss` (Todo 16 / creature content).
