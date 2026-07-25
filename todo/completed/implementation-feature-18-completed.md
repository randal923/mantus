# Feature 18 — completed (partial: rules layer)

Cross-links: [implementation-feature-18.md](../implementation-feature-18.md) ·
[todo-7.md](../todo-7.md) · [implementation-feature-72.md](../implementation-feature-72.md).

---

## 2026-07-24 — Stamina, soul eligibility, stages, and training rule engines

**Problem.** After core XP/skills/vocations shipped, the remaining persistent
progression modifiers were missing: stamina (explicitly required parity), the
exact soul-regeneration eligibility rules, configurable skill/magic/exp rate
stages, and the offline-/exercise-training conversion math.

**Canary references used** (pinned checkout `/home/randal/code/canary`): stamina
offline regen `data/scripts/creaturescripts/player/regenerate_stamina.lua`,
online decay + soul condition `data/events/scripts/player.lua`, XP multiplier
`data/libs/functions/player.lua` (`getFinalBonusStamina`), stages
`data/stages.lua` + `getRateFromTable`, offline training
`data/scripts/creaturescripts/player/offline_training.lua`, exercise weapons
`data/scripts/actions/items/exercise_training_weapons.lua`, vocation
soul/mana/attack constants `data/XML/vocations.xml`.

### Stamina (fully wired)

- Stored in minutes (0..2520, start/max 2520). New `stamina` +
  `last_seen_at` columns — `server/db/migrations/038_stamina.sql`.
- Pure rules — `server/src/progression/staminaRules.ts`:
  - `regenerateOfflineStamina` — 10-min grace, ≥180s countable minimum,
    normal band +1/3min up to 2340, green band +1/6min to 2520, 21-day cap.
  - `decayHuntStamina` — throttled online decay (first hunt after login costs
    two, then ≤1 per real minute).
  - `getStaminaExperienceMultiplier` — 0 / orange 0.5 (≤840) / normal 1 /
    green 1.5 (>2340 **and** premium).
- Applied at load in `CharacterProgression` (offline regen once, from the
  durable offline span); decay + multiplier applied per kill in
  `combat/DeathHandler.awardHuntExperience` (each party recipient decays its
  own stamina; a qualifying kill also arms soul). Projected to the client via
  `projectOwnProgression` (`stamina`, `maxStamina`, `staminaBonusPercent`).
- **Offline anchor = `last_seen_at`**, the app wall-clock of the last durable
  save (server clock only, never client time). `CharacterPersistence.untrack`
  now forces a final save on every clean logout/disconnect so an idle
  character cannot keep a stale anchor and mint stamina by logging out and
  back in. A hard crash bounds over-grant to one save interval (< the 780s
  regen threshold), so it can never manufacture a stamina-minute.

### Soul eligibility (fully wired, Canary-exact)

- Replaced always-on soul regeneration. Soul now regenerates only while armed
  by a recent qualifying kill (base exp ≥ level) — `SOUL_ELIGIBILITY_MS` = 4
  min — **and** the player is outside a protection zone. `CharacterProgression`
  tracks `soulEligibleUntil`; `tick` takes `inProtectionZone` (fed from
  `World.isProtectionZone` in `ProgressionSystem.tick`). Soul is no longer
  coupled to the combat-lock condition.

### Configurable stages (fully wired)

- `server/src/progression/stageRates.ts` — Canary experience/skill/magic stage
  tables + `getStageRate` lookup. Toggled by `progression.useStages` in
  `config.yml`. Skill/magic bands resolve per current level in
  `ProgressionSystem`; experience band resolves per killer level in
  `DeathHandler`. Default off → flat `config.rates` (unchanged behavior).

### Training rule engines (rules shipped; in-world triggers delegated)

- `server/src/progression/offlineTraining.ts` — `computeOfflineTraining`
  (weapon = time / (attackSpeed/1000) / (distance?4:2), magic = time ×
  manaGain/ticks, co-trained shielding = time/4, 12h bar cap, 10-min gate,
  `rates.offlineTraining` multiplier).
- `server/src/progression/exerciseTraining.ts` —
  `computeExerciseTrainingGain` (7×rate tries or 600×rate mana per tick, dummy
  rate, `rates.exerciseTraining`) + `exerciseTrainingIntervalMs`.
- These are the parity math. The **in-world triggers** — offline-training
  statues, the durable offline-training bar column + transactional login
  conversion, and the exercise-weapon/dummy charge-consuming action loop (PZ
  gate, exhaustion) — are the bed/statue/dummy substrate owned by **Feature 72**
  (which the plan already lists as the shared, non-duplicated substrate). They
  are tracked in `TODO.md` and `implementation-feature-18.md`, cross-linked to
  Feature 72.

### Config (`config.yml` → `rates` / `progression`)

- `rates.soulRegen`, `rates.offlineTraining`, `rates.exerciseTraining`;
  `progression.staminaSystem`, `progression.useStages`. Threaded through
  `loadServerConfig` → `ServerConfig` → `GameServer` → `Combat`/`DeathHandler`
  and `ProgressionSystem`.

**Files touched (durable/runtime).** `config.yml`,
`server/src/loadServerConfig.ts`, `server/src/config.ts`,
`server/db/migrations/038_stamina.sql`, `server/src/character/{Character,
CharacterRow,toCharacter,CharacterService,CharacterPersistence,PgCharacterStore}.ts`,
`server/src/character/sql/{characterColumns,updateCharacterSnapshotQuery}.ts`,
`server/src/progression/{CharacterProgression,ProgressionSystem,
projectOwnProgression,assertValidCharacterSaveSnapshot,staminaRules,stageRates,
offlineTraining,exerciseTraining}.ts`, `server/src/Player.ts`,
`server/src/combat/{Combat,DeathHandler}.ts`, `server/src/GameServer.ts`,
`protocol/src/progression.ts`, plus client Storybook fixtures.

**Verification.** `yarn typecheck` (server, protocol, client) clean;
`yarn test` server suite 786 passing. New tests: `staminaRules.test.ts`,
`stageRates.test.ts`, `offlineTraining.test.ts`, `exerciseTraining.test.ts`,
stamina/soul cases in `CharacterProgression.test.ts`, stages case in
`ProgressionSystem.test.ts`, forced-logout-save case in
`CharacterPersistence.test.ts`. Named feature tests covered: reconnect cannot
manufacture stamina (offline span ~0 regenerates nothing; idle-logout stamped
via forced save), green/orange/logout thresholds computed deterministically,
training idempotency (existing event-id dedupe).

**Residual risk / delegated.** Offline-training bar persistence + statue
trigger + transactional login conversion, and the exercise-weapon/dummy action
loop, are delegated to Feature 72 (shared substrate). Hard-crash offline
over-grant is bounded below the regen threshold. Soul eligibility is
session-only (not persisted across relog) — a minor, safe deviation.
