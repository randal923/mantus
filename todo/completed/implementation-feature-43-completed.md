# Feature 43 — completed sub-work

Mantus Store parity completion, from
[implementation-feature-43.md](../implementation-feature-43.md). The feature
stays **open** for the real-money purchase path and the client UI.

Cross-links: [implementation-feature-43.md](../implementation-feature-43.md) ·
[implementation-feature-96.md](../implementation-feature-96.md) (admin
tooling) · [todo-12.md](../todo-12.md).

---

## 2026-07-25 — Coin grants, item products, refunds, and coin history

**Problem.** The first slice shipped account-scoped coins and a Premium Time
catalog, but there was no legitimate way to add coins to an account, only one
product kind existed, purchased goods could not be delivered as items, and
nothing could be refunded.

**What changed.**

- **Migration 042** adds the idempotency and reversal spine to
  `mantus_coin_ledger`: `request_key` (unique where present),
  `refunded_entry_id` (unique where present, self-referencing the purchase it
  reverses) and `operator_character_id`. "One refund per purchase" and "one
  effect per request key" are therefore **database invariants**, not
  application read-checks. It also adds the `store-grant` and `store-refund`
  audit event types.
- **Item products.** `StoreOffer` now grants premium time *or* an item, never
  both and never neither — enforced by a zod `refine` and re-checked
  server-side. `PgMantusStore.purchase` performs the inbox insert **inline, in
  the purchase's own transaction**, reusing the shipped reward-delivery SQL
  (`rewardItemInsert`, `rewardDeliveryInsert`, `rewardAuditInsert`, the inbox
  revision bump). A delivery that cannot land rolls the coin debit back with
  it, so `inbox-full` leaves zero partial state. The catalog gained a
  `useful-things` category exercising the lane.
- **Replay safety.** Every coin-moving operation carries a request key and
  checks it *before* charging. A replayed purchase returns the first outcome
  with `deliveredItem: null` — one debit, one ledger row, one inbox item.
- **Operator grants and refunds.** `StoreOperatorService` plus the `/coins` and
  `/storerefund` GM commands. The account credited is always the operator's
  **own**, resolved from their live session — never an account id from a
  message body (charter rule 9). Both are audited with the operator's character
  id. GM commands only exist when the server runs with `DEV_COMMANDS=1`, so
  this is a development/operator surface, not a player-reachable one.
- **Coin history.** `store-history` → `store-history-state` serves the
  session's own ledger, newest first, bounded by
  `STORE_LIMITS.maxHistoryEntries` (50). The account is the session's own; the
  message carries no account id at all.
- **Live inbox injection.** A delivered product is pushed into the buyer's
  in-memory inbox cache through `DepotService.injectDelivery`, so it appears
  without a relogin. Buffered if they are mid-login, id-keyed either way.
- `store-purchase-completed` reports the real `accountTier` (an item purchase
  does not make anyone premium) and flags `deliveredToInbox`.

**Files touched.** `server/db/migrations/042_mantus_store_products.sql` (new),
`server/src/store/{MantusStoreStore,PgMantusStore,MantusStoreService,MANTUS_STORE_CATEGORIES}.ts`,
`server/src/store/StoreOperatorService.ts` (new),
`server/src/store/sql/*.ts` (new: six query modules),
`server/src/depot/DepotService.ts`, `server/src/gm/GmCommandHandler.ts`,
`server/src/GameServer.ts`, `server/src/index.ts`, `protocol/src/store.ts`,
`protocol/src/{clientMessages,serverMessages}.ts`.

**Verification.** `PgMantusStore.integration.test.ts` (9 passing) gains: an
item product lands in the inbox in the purchase's own transaction and leaves
premium untouched; a full inbox rolls the coin debit back entirely; a replayed
purchase neither double-charges nor double-delivers; a grant applies once per
grant key and audits the operator; a refund applies exactly once and the second
attempt reports `already-refunded`; history returns the account's own entries
newest first. Full suites: `vitest run` 958 passed, `test:integration` 199
passed.

**Residual risk.** The catalog's item ids are hand-picked from the pinned
catalog; there is no test asserting every offer's `itemTypeId` exists and is
pickupable. `PgMantusStore` validates it at purchase time (`catalog.require`
throws, `pickupable` is checked), so a bad id fails loudly on first purchase
rather than silently — but a load-time gate would be better.
