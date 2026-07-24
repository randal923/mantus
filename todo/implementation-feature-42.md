# Feature 42 — Travel bank-fallback payment

Part of [Todo 11 — NPCs, dialogue, and travel](todo-11.md).

## Why
Canary's `removeMoneyBank` falls back to the player's bank balance when carried money is short; our travel fare collection only spends carried gold/platinum/crystal coins. The bank has shipped, so this is implementable now.

## Remaining work
- Extend fare collection to debit the bank balance for any shortfall after carried money, matching Canary's `removeMoneyBank` semantics.

## Implementation
- Extend fare collection in `server/src/npc/PgNpcTravelStore.ts` / `server/src/npc/TravelService.ts` to debit the bank row in the same serializable transaction as the carried-coin leg, with an audit entry for the bank debit (charter rules 2/11 — one ACID transaction, audit log for economy events).
- Fare amount and split remain server-computed; carried/bank amounts re-checked at confirmation execution inside the tick (charter rule 4).
- Preserve the shipped exact-fare optimization (exact fares skip backpack/change allocation) where applicable.
- Note the transient-error gap from Feature 31: economy transaction helpers do not yet retry SQLSTATE 40001 — apply `withSerializableTransaction` here or coordinate with that feature.

## Tests
- Fare paid partly carried / partly bank cannot double-spend under concurrent confirmations (extend `server/src/npc/TravelService.test.ts`).
- Insufficient combined funds rejects without partial debit; bank balance never goes negative.
- Audit entries present for both legs in the same transaction.

## Dependencies
- Bank — shipped (remaining bank gaps are Feature 45); this feature is implementable now.
- Feature 31 for the shared serializable-retry hardening of economy helpers.
