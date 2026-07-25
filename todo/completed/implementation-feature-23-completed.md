# Feature 23 — completed sub-work

Feature 23 is **still open**. Cross-links:
[implementation-feature-23.md](../implementation-feature-23.md) ·
[todo-8.md](../todo-8.md).

---

## 2026-07-25 — Follow, challenge/taunt, aim-at-target, combat analyzer

**Problem.** Pinned parity includes attack/follow, challenge/taunt,
aim-at-target and a combat analyzer, none of which existed. Each had to arrive
as a bounded intent plus server-owned state — never client-computed.

**What changed.**

### Follow (bounded intent + server-owned state)

- `protocol/src/clientMessages.ts` — `follow-creature` / `cancel-follow`,
  both `.strict()`; the client only names a creature, never a path or step.
- `protocol/src/serverMessages.ts` — `follow-target-changed`.
- `server/src/Session.ts` — `followTargetId`.
- `server/src/combat/ChaseController.ts` — the chase stepping was split into a
  private `stepToward`, reused by a new `followTarget` (Canary keeps the
  follower one tile away) that ignores the chase fight-mode flag.
- `server/src/combat/Combat.ts` — `followCreature` / `cancelFollow`, plus a
  per-tick `tickFollow` that re-validates the target from live state (alive,
  same floor, known to the session, still in view) and drops the follow
  otherwise. Selecting an attack target clears the follow and vice versa, so
  only one thing ever steers the player.
- Client: `GameClient.followCreature/cancelFollow`, store `followTargetId`,
  and a Follow / Stop Follow entry in `GameMapContextMenu`.

### Challenge / taunt

- `server/src/ai/MonsterBrain.ts` — `challenge(world, challenger, now,
  durationMs)` (Canary `Monster::challengeCreature`) pins the target and
  suppresses the change-target roll for the whole focus window; it re-checks
  `canAcquireTarget`, so a challenge can never point a monster at something it
  could not otherwise target. `pullToMelee(distance, now, durationMs)`
  (Canary `changeTargetDistance`) only ever *reduces* the target distance.
- `server/src/combat/TargetingHooks.ts` — new interface (`challengeMonster`,
  `pullMonsterToMelee`, `isSummon`, `summonForPlayer`, `playerSummonCount`,
  `findMonsterTypeByName`), implemented by `SpawnManager`, which owns the
  brains and the summon-ownership registry. Summons are refused outright, and
  every call re-resolves the live creature instance first.
- `server/src/GameServer.ts` — `combatSystem.attachTargeting(spawns)` after
  the spawn runtime is constructed; combat fails closed while it is absent.

### Aim-at-target

- Canary semantics (`src/creatures/combat/spells.cpp`): for a spell in the
  player's opted-in set, a *direction* cast derives its direction from the
  live attack target instead of the player's facing. Nothing else changes.
- `protocol` — `set-aim-at-target-spells` (bounded by
  `AIM_AT_TARGET_SPELL_LIMIT`), the `aim-at-target-spells` echo, and the set
  on `welcome`.
- `server/src/combat/primaryDirectionToward.ts` — Canary's
  `getPrimaryDirection` (strictly cardinal, never diagonal).
- `server/src/combat/aimDirectionFor.ts` — returns the aim direction only when
  the target is still live, known to the session, and in view; otherwise the
  facing is used. `resolveSpellTarget` grew an optional `castDirection`.
- `Combat.sanitizeAimAtTargetSpells` drops unknown ids and spells the
  character cannot cast, so the persisted set can never carry arbitrary text.
- Durable per character: migration `039_character_aim_at_target.sql`,
  `parseAimAtTargetSpells`, `CharacterStore.updateAimAtTargetSpells`.

### Combat analyzer

- `server/src/combat/CombatAnalyzerTotals.ts` — counters live on the `Player`
  instance, so they start at zero on login and disappear with the player;
  there is no keyed map to leak.
- `server/src/combat/DamageResolver.ts` records dealt/taken/healing from the
  amounts the server itself rolled.
- `server/src/combat/projectCombatAnalyzer.ts` — rows are exactly the
  player's own party (or just the player), via the new
  `PartyHooks.getPartyMemberIds`. Nothing out-of-view can appear.
- Pushed on a `COMBAT_ANALYZER_INTERVAL_MS` cadence rather than per damage
  event, and on `reset-combat-analyzer`.

**Tests.**

- `server/src/combat/Combat.test.ts` — a follow with a forged/unknown/off-floor
  target is dropped and never steers the player; attacking clears the follow;
  the analyzer projects only the session's own row and resets to zero;
  aim-at-target falls back to the facing once the target stops being visible;
  `sanitizeAimAtTargetSpells` drops unknown and un-castable ids.
- `server/src/ai/MonsterBrain.test.ts` — a challenge holds through the
  change-target roll, is refused for an unacquirable (off-floor) challenger,
  and `pullToMelee` refuses a distance that would push the monster further out.
- `server/src/spawn/SpawnManager.test.ts` — challenge and melee-pull are
  refused for summons and for a monster that is no longer the live instance.
- `server/src/combat/CombatIntentHandler.test.ts` — the new intents route to
  the tick-owned combat system.

**Residual risk / deferred.** See the remaining-work list in
[implementation-feature-23.md](../implementation-feature-23.md): boss
difficulty, hazard levels and encounters stay with Todo 16 Feature 86 (which
already owns them), and there is no client panel for the analyzer or an
aim-at-target toggle in the spell list yet — the server half is complete and
the messages are in the protocol.
