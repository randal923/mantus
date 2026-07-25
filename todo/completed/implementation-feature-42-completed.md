# Feature 42 — completed

Travel bank-fallback payment, from
[implementation-feature-42.md](../implementation-feature-42.md).

Cross-links: [implementation-feature-42.md](../implementation-feature-42.md) ·
[implementation-feature-45.md](../implementation-feature-45.md) (the bank-side
twin) · [implementation-feature-31.md](../implementation-feature-31.md)
(serializable retry) · [todo-11.md](../todo-11.md).

---

## 2026-07-25 — Fares fall back to the bank, and travel joins the retry lane

**Problem.** Canary's `removeMoneyBank` spends carried money and falls back to
the bank balance for the shortfall; travel fare collection only spent carried
gold/platinum/crystal, so a player with 40 gold carried and 5 000 banked could
not board a 110-gold boat.

`PgNpcTravelStore` also ran its own hand-rolled `BEGIN ISOLATION LEVEL
SERIALIZABLE` with no serialization retry — the gap Feature 31 closed
everywhere else.

**What changed** (`server/src/npc/PgNpcTravelStore.ts`):

- The transaction body moved into `execute(client, …)` and the entry point now
  goes through `economy/runSerializableTransaction`, so a `40001`/`40P01` abort
  re-runs the whole thing — every read and every execution-time check included
  — instead of surfacing as a user-visible failure.
- Payment splits into `carriedPay = min(carriedWorth, cost)` and
  `bankPay = cost - carriedPay`, mirroring `executeShopPurchase`. When there is
  a shortfall the account row is locked (and created if absent) through
  `lockBankBalance` **before anything is mutated**, so an unaffordable fare
  rolls back with `insufficient-funds` having debited neither leg.
- The bank leg debits via `debitBankBalance` and appends a `bank_ledger` row
  (`npc-travel`, added by migration 041) in the same transaction as the coin
  destruction, the character position/version bump and the `npc-travel` audit
  row — which now records `bankSpent` alongside `cost`.
- The exact-fare optimization is preserved and now documented: a fare needing
  no change never locks the backpack.

Both amounts stay server-computed; the client supplies only the offer id.

**Files touched.** `server/src/npc/PgNpcTravelStore.ts`,
`server/src/npc/PgNpcTravelStore.integration.test.ts` (new),
`server/db/migrations/041_shop_restock_and_bank_fallbacks.sql`
(shared with Feature 46), `server/package.json` (integration test list).

**Verification.** `PgNpcTravelStore.integration.test.ts` — four cases: a fare
paid 40 carried + 70 banked leaves carried at 0, the bank down exactly 70, one
`npc-travel` ledger row and one audit row recording the split; a fare fully
covered by carried coins touches neither the bank nor the ledger; an
unaffordable fare rejects with no partial debit and no position change; two
racing confirmations commit exactly one fare (the character version guard),
leaving one ledger row and one audit row. `yarn workspace server
test:integration` — 187 passed.

**Residual risk.** None recorded. Gated routes and Postman discounts are
Feature 41's, and travel-time quest side effects ride the same transaction once
that lands.
