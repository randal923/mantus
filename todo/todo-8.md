# Todo 8 — Economy

**Features 43, 45, 46, 48, 49.** The economy core is complete and
exploit-tested end to end: bank, NPC shops (8,368 offers, restock, backpack
destinations, bank fallbacks), depot/inbox/mail/stash on the
memory-authoritative lane, trade with orphan-restore, market with escrow +
stash-sourced sells + live counterparty push, the Mantus Store with
grants/refunds/history/item delivery, the conservation sweep, and the
persist-failure live resync (see [done.md](done.md)).

**Standing rules:** never touch more than one economy-relevant system per
PR; every money/item move carries its audit entry in the same transaction
that performs it.

## Feature 43 — Mantus Store parity completion

The Canary catalog, every deliverable offer type, and the official store
layout shipped 2026-07-29 (see [done.md](done.md)). What is left:

**Remaining work**

- **Run the integration tests.** The 20 `PgMantusStore.integration.test.ts`
  cases — every delivery leg's transaction, the racing-purchase and
  replay-guard assertions, the inbox-full rollback — were written but never
  executed: no Postgres was reachable when they landed. Run them before
  trusting the store. **This is the highest-priority item here.**
- **Real-money purchase path.** Nothing turns money into coins: needs a
  payment provider, webhook verification, and a grant keyed by the
  provider's transaction id (the `request_key` column exists for exactly
  this). Until then `/coins` and `yarn coins:grant` are development surfaces.
- **Transferable coin balances.** Coins are account-scoped; Canary gifting
  needs a transfer op with both legs in one transaction plus an anti-abuse
  policy. Canary's second balance (`coins_transferable`) is deliberately not
  modelled yet.
- **Offer types with no system behind them** — blessings (needs Feature 72's
  persistence; nothing grants or stores them today), hirelings, charm
  expansion, instant reward access, beds (two-part items + sleep), casks
  (potion servings from a house vat), tournament. The importer skips and
  reports each one; adding the system is what unblocks the offer, not the
  catalog. House decoration kits shipped 2026-07-29 (Upgrades incl. the three
  exercise dummies, Furniture, Decorations — 380+ offers); the wrap-back op
  and the Postgres run of the kit delivery test are recorded in `TODO.md`.
- **Sex-change save race.** The delivery writes `characters.sex` and the worn
  look type inside the purchase transaction without bumping `version`; a
  character snapshot save landing between commit and the tick applying the
  effect would write the old look type back. The window is sub-tick. Fix by
  having the delivery bump `version`, or by making the save skip outfit
  columns it did not author.
- **Capability move:** `/coins` and `/storerefund` onto Feature 96's surface
  behind an `economy.grant` capability (todo-12).
- Client history UI → [client backlog](client/feature-43-store-history-ui.md).

## Feature 45 — Bank parity gaps

**Remaining work**

- **`change gold` / `change platinum` conversions.** A pure carried-coin
  transform — no bank balance touched — so it needs its own store op:
  `BankStore.changeMoney` running `destroyItems` + `grantStackable` for the
  two denominations in one SERIALIZABLE transaction with an `audit_log` row
  recording both legs. Dialogue side: a third branch in
  `server/src/npc/withBankKeywords.ts` plus a `bank-keyword` operation value;
  the amount parser exists.
- **`minTownIdToBankTransferFromMain`** — nothing to gate until multi-town
  support exists.
- Guild bank shipped with Feature 58 (todo-9) — rank permission + client UI
  live there, not here.

**Tests:** change conversions conserve carried worth exactly, under
concurrency, in one transaction.

## Feature 46 — NPC shop parity completions

**Remaining work**

- **Move the carry-capacity check inside the purchase transaction** (stale
  validation, charter rule 4; the current window is one tick). Cheap now:
  `coinOwnedItemsQuery` already loads every owned row in the transaction, so
  weight can be summed from the catalog there — `capacityMax` rides along on
  the server-built `ShopPurchaseRequest` (server-computed from
  level/vocation/wheel, never client-supplied).
- **Shopping bags sold as containers** — Canary fills the purchased bag in
  the same transaction that created it; here a purchased container is inert.
- **Finite stock** — plumbing, schema, and tests exist and are inert; no
  pinned catalog entry declares `stock`, so enabling it is a content
  decision.

## Feature 48 — Player-trade parity completions

**Remaining work**

- **Ground-item trade offers.** Extend `trade-request` in
  `protocol/src/trade.ts` with an optional map-position source; route through
  the pickup reach/auto-walk validation before reserving; re-check reach and
  ownership at execution time. Test: forged out-of-reach source rejected; a
  trade-offer racing a pickup on the same ground item leaves exactly one
  owner.
- **Store-item/unique-id/house-tile restrictions.** Predicates in
  `TradeService` / `planTradeReservation.ts` at both offer and commit time —
  partially unblocked 2026-07-26: Feature 78's tier/imbuement attributes now
  exist on item rows (`attributes.tier`/`attributes.imbuements`), so
  tiered/imbued-item trade predicates can land; still waiting on Feature 43
  store items, todo-9 house tiles, and a unique-id item model.
- Documented deviations, no action planned: reserved-offer visibility
  (reserved items vanish from the giver's visible inventory; conservation
  unaffected) and index-based per-item look (full offer pushed as one
  projection; nothing extra exposed).

## Feature 49 — Market parity completions

**Remaining work**

- **Marketable-catalog browser** — Canary browses the full catalog from DAT
  `ATTR.market` metadata, which the importer discards. Needs the
  asset-import pipeline regenerated to keep `ATTR.market` (or an expanded
  `marketCategoryOf.ts`), a paged full-catalog read op in
  `PgMarketReadOps.ts` bounded by `MARKET_LIMITS`, and a client browser
  list. **Blocked on the asset regeneration (Feature 108, todo-4).**
- **Pristineness extensions** — currently "empty attributes, no contained
  items"; revisit as Features 43/78 add attributes that must not silently
  make items unsellable or sellable-while-carrying-value.
- **Expiry with a full inbox** — defers one hour and retries vs Canary's
  capacity-bypassing insert; open decision (keep as deviation or add a
  bypass flag to the expiry op; one transaction + audit either way).
- Offer detail carries no level/vocation display and no anonymous flag —
  tighter than Canary (names never exposed); parity optional.
- Selection retention after `market-transacted` →
  [client backlog](client/feature-49-market-selection.md).

[Back to overview](README.md)
