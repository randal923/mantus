# Feature 32 — Full Canary player-death penalty parity

Part of [Todo 9 — Death, corpses, loot, and decay](todo-9.md).

## Why
The shipped v1 penalty (flat 10% total-experience loss, atomic with respawn, replay-proof via persisted `death:{uuid}` event ids) is an explicit stand-in. Canary parity needs the full stack, and most of its underlying systems (skill loss, blessings, item drop, PVP fairness) do not exist yet.

**Shipped 2026-07-25** (see
[completed/implementation-feature-32-completed.md](completed/implementation-feature-32-completed.md)):
Canary's full loss formula as typed data (level curve, promotion, blessing and
unfair-fight discounts), skill and magic-level loss charged from the same
death event, and the PVP unfair-fight reduction measured from live damage
attribution.

## Remaining work
- Blessings: purchase/state plus the blessing count feeding
  `Player.blessings` (the formula seam already exists and reads 0). Owned with
  Feature 72.
- Item/container loss into a player corpse, governed by blessing state — the
  one leg that needs a new atomic item operation (equipment plus backpack into
  a fresh player corpse in the penalty's transaction, with audits).

## Implementation
- Extend the player branch of `Combat.handleDeath` (`server/src/combat/Combat.ts` / `server/src/combat/DeathHandler.ts`), `Player.applyDeathPenalty`, and `CharacterProgression.loseExperience`; express penalty rules as typed data, not code branches per vocation.
- Item loss is an item leg of the death transaction: one ACID transaction carrying the penalty snapshot, the item moves into the corpse, and audit entries (charter rules 2 and 11). The corpse becomes a player corpse via the existing memory-first machinery (`server/src/item/CorpseCreator.ts`, `ownerCharacterId` stamping).
- Blessing consumption happens inside the same transaction — checked at execution time in the tick, not at enqueue.
- Blessings intersect NPC dialogue (Quentin currently gives informational-only blessing dialogue; needs typed purchase commands from Feature 38/40) and bank/gold (bank shipped).
- Canary reference: death penalty formulas and blessing reductions in opentibiabr/canary.

## Tests
- Exactly-once item drop under concurrent lethal hits (extend `Combat.test.ts`).
- Blessing consumed atomically with the penalty — no path where the blessing is spent but the penalty applies in full, or vice versa.
- No dupe of dropped items on reconnect (replay of the persisted death event id must not re-drop).
- Penalties neither skipped nor doubled on reconnect (existing `server/src/progression/CharacterProgression.test.ts` invariant extended to the full stack).

## Dependencies
- Feature 72 (beds/stamina/blessings/training) for blessing purchase/state.
- Bank (shipped) for blessing payments.
- Skill system (todo-7 progression) for skill loss.
- Feature 60 (PVP zones/blessings) for unfair-fight/PVP reductions.
- Features 38/40 for typed blessing-purchase NPC commands.
