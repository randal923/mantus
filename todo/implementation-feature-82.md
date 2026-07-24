# Feature 82 — Weapon proficiency and animus mastery

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
Weapon proficiency and animus mastery are pinned Canary progression systems modifying combat and vocation spells beyond what the wheel wiring covers.

## Remaining work
- Weapon proficiency.
- Animus mastery.
- Vocation spell modifications (beyond the Feature 79 wheel wiring).

## Implementation
- New proficiency/animus tracking in the progression system (durable per-character state, server-side accrual from combat events).
- Combat application in `server/src/combat/` at execution time; Canary reference available for exact perk tables and accrual rates.
- Bounded selection intents in `protocol/` where the player chooses proficiency perks.

## Tests
- Accrual only from server combat events; perk selections validated against earned progress at execution time.

## Dependencies
- Feature 79 (wheel combat wiring) and the spell system (todo-8).
