# Feature 46 — completed

NPC shop parity completions, from
[implementation-feature-46.md](../implementation-feature-46.md).

Cross-links: [implementation-feature-46.md](../implementation-feature-46.md) ·
[implementation-feature-45.md](../implementation-feature-45.md) (reuses the
backpack destination planning) · [todo-12.md](../todo-12.md).

---

## 2026-07-25 — Sale bank fallback, nested backpack destinations, restock schedule

### 1. Sale proceeds fall back to the bank

**Problem.** Canary credits the seller's bank with proceeds that do not fit in
their inventory; here the whole sale rolled back with `no-space`.

**What changed.** `server/src/economy/executeShopSale.ts` now grants what fits
and credits the remainder — converted at each denomination's worth — to
`bank_accounts` inside the same SERIALIZABLE transaction, with a `bank_ledger`
entry (`shop-sale`) and the split recorded in the `shop-sale` audit row. The
account row is locked through `lockBankBalance` before crediting, so a racing
sale on the same character serializes there instead of over-crediting, and a
credit that would exceed `BANK_LIMITS.maxBalance` rolls the sale back rather
than erroring.

A non-gold shop currency (silver tokens and friends) has no bank denomination,
so that branch stays all-or-nothing — pinned by its own test.

`shop-transacted` gained an optional `bankCredited` field so the player is told
where their coins went. Own data only.

### 2. Purchases descend into nested bags

**Problem.** Grants only used free slots in the top level of the equipped
backpack; a full top level failed the purchase even with an empty bag inside.

**What changed.** `sql/lockBackpackQuery.ts` became a recursive subtree lock
(depth ≤ 8, ordered by id like the depot's `lockSubtreeQuery`, so the two lanes
cannot deadlock each other). `BackpackSlotLocker` builds an ordered destination
list — the equipped backpack first, then its nested containers depth-first by
slot — and `OwnedItemGranter.takeFreeSlot` walks it. `BackpackSlots` is now
`{ containers: [{ containerId, capacity, occupiedSlots }] }`.

Canary fills whichever container the player has open; the server has no
open-container concept for economy grants, so this deterministic order stands
in for it. Documented at the type.

**Contract change.** `grantStackable` returned `boolean` while *already having
partially written rows* — a lie the sale fallback could not build on. It now
returns the number of units it could not place (0 = all granted). The nine
all-or-nothing call sites (bank deposit/withdraw, market change, shop
purchase/change, travel change, promotion change, spell change) read
`ungranted > 0` and roll back as before; only the sale path keeps the partial
grant and banks the rest.

### 3. Restock schedule

**Problem.** Finite stock was durable and race-safe via `reserveShopStock.ts`
but nothing ever refilled it.

**What changed.** `ShopEntry.restockIntervalSeconds` (60 s – 30 d, rejected
without `stock`) declares the schedule in the catalog.
`server/src/economy/ShopRestockRunner.ts` seeds the durable rows from the
catalog at boot and sweeps once a minute, off-tick, touching no live game
state.

There is no lease table: **the row's own `restock_at` is the lease.** The sweep
is one conditional `UPDATE … WHERE restock_at <= now()` that refills the offer
and advances its deadline to the first boundary strictly after now. That makes
it idempotent across restarts, correct across downtime spanning many intervals
(one refill, not N), and safe to run from two servers — the loser re-evaluates
the guard after taking the row lock and updates nothing. Boot seeding keeps an
unchanged schedule's existing deadline, so a restart mid-interval does not push
the next restock out.

No pinned Canary offer declares `stock`, so the schedule is inert until content
does; the plumbing and its tests are what this ships.

### 4. Repaired a dropped audit constraint

Migration 040 rewrote `audit_log_event_type_check` wholesale and silently
dropped `'store-purchase'` (added by 033). Every Mantus Store purchase
therefore failed its audit insert — and so its whole transaction — against a
fully migrated database. Migration 041 restores the full list.

**Files touched.** `server/db/migrations/041_shop_restock_and_bank_fallbacks.sql`
(new), `server/src/economy/{executeShopSale,executeShopPurchase,executeBankDeposit,executeBankWithdraw,OwnedItemGranter,PgCoinOperations,BackpackSlots,BackpackSlotLocker,ShopCatalog,loadShopCatalogs,ShopStore,PgShopStore,ShopService,ShopOperationResult,appendBankLedger}.ts`,
`server/src/economy/ShopRestockRunner.ts` (new),
`server/src/economy/sql/{lockBackpackQuery,seedShopRestockQuery,restockDueOffersQuery,insertShopSaleAuditQuery}.ts`,
`server/src/market/spendMarketFunds.ts`,
`server/src/npc/{PgNpcTravelStore,PgPromotionStore,PgSpellTeacherStore}.ts`,
`protocol/src/shop.ts`, `server/src/GameServer.ts`.

**Verification.** `PgShopStore.integration.test.ts` (18 passing) gains: proceeds
that do not fit credit the bank with currency conserved (`carried + bank ==
proceeds`) in one transaction with its ledger row; a non-gold currency sale
still rolls back whole; a purchase fills a nested bag once the backpack is
full; a due offer restocks exactly once across repeated sweeps *and* across a
replayed boot seed; downtime spanning ten intervals restocks once.
`ShopRestockRunner.test.ts` covers seeding selection, non-overlapping sweeps,
and recovery after a failed sweep. Full suites green: `yarn workspace server
test:integration` 183 passed; `vitest run` 937 passed.

**Residual risk.** Carry capacity is still re-checked only in the tick
precheck, not inside the transaction — see the note kept in
[implementation-feature-46.md](../implementation-feature-46.md).
