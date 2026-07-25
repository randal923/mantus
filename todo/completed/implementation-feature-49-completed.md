# Feature 49 — completed sub-work

Market parity completions, from
[implementation-feature-49.md](../implementation-feature-49.md). The feature
stays **open** for the full-catalog browser (blocked on the asset pipeline) and
the pristineness extensions (blocked on the item models they describe).

Cross-links: [implementation-feature-49.md](../implementation-feature-49.md) ·
[implementation-feature-45.md](../implementation-feature-45.md) (shares the
counterparty push) · [todo-12.md](../todo-12.md).

---

## 2026-07-25 — Stash-sourced sells, live counterparty push, partial-fill UI

### 1. Sell offers can source the supply stash

**Problem.** Sells could only escrow depot rows. Stock a player had stowed was
invisible to the market even though the stash holds exactly the pristine,
attribute-free items the market accepts.

**What changed.** `pickEscrowSources` now returns an `EscrowPlan`
(`{ sources, stashTake }`): depot rows first, the stash covering whatever is
left. `sellableDepotCounts` counts stash stock as sellable, so the browser
shows it.

`server/src/market/drawFromStash.ts` (new) takes units out of the counter
inside the caller's transaction and reports how to split them into rows. The
counter is decremented and the rows are minted in that same transaction — one
atomic move, never copy-then-delete (charter rule 2). It re-reads the counter
under `FOR UPDATE` rather than trusting the memory plan, so a racing create
finds the reduced count. `supply_stash.count` is constrained to 1 or more, so
emptying the stash deletes the row instead of writing a zero.

Both item-sourcing paths use it: `PgMarketCreateOps.createSellOffer` mints into
`market-escrow`, and `PgMarketAcceptOps.acceptBuyOffer` mints straight into the
buyer's inbox. The coverage check became
`coveredAmount + stashTake === amount`, and the escrow/inbox slot reservations
account for the extra rows.

### 2. An online counterparty learns of a fill immediately

After an accept commits, `MarketService` pushes a fresh `bank-updated` to the
counterparty's live session — their own balance and nothing else: no acceptor
name, no offer, no price (charter rule 6). This is the same push mechanism
[Feature 45](implementation-feature-45-completed.md) added for bank transfers.
A failed push is logged and dropped: the fill is already committed and the next
market/bank open shows the true balance.

### 3. Order-book partial fills

`client/components/auction/AuctionOfferRow.tsx` (new) replaces the duplicated
buy- and sell-side row bodies in `AuctionOrderBook`. Each row now has an amount
input, clamped client-side to the offer's remaining amount purely so the UI
cannot ask for something it knows will be refused — `market-accept-offer`
already supported partial fills server-side, and the server still re-validates
amount, price and funds at execution time.

**Files touched.** `server/src/market/{pickEscrowSources,sellableDepotCounts,MarketStore,MarketService,PgMarketCreateOps,PgMarketAcceptOps}.ts`,
`server/src/market/drawFromStash.ts` (new),
`server/src/market/sql/{lockStashRowQuery,reduceStashRowUpdate,insertStashEscrowAudit}.ts`
(new), `server/src/GameServer.ts`,
`client/components/auction/{AuctionOfferRow.tsx (new),AuctionOrderBook.tsx}`,
`client/locales/{en,pt-BR}.json`.

**Verification.** `PgMarketStore.integration.test.ts` (40 passing) gains three
cases: a 40-depot + 50-stash sell escrows 90 items and leaves the counter at
10; two creates racing the same 100-unit stash commit exactly one; a create
that fails on funds leaves the counter untouched at 100.
`pickEscrowSources.test.ts` covers the depot→stash fallback, stash-only sells,
and stash-inclusive sellable counts. Client typecheck clean; `client vitest
run` leaves the same three pre-existing storybook failures it had before these
changes (verified by stashing them).

**Residual risk.** Stash draws are audited as `item-created` with the
`market-stash-escrow` operation, which is what the Feature 44 conservation
sweep reads — a stash-sourced escrow correctly registers as minting coins'
worth of items rather than moving them, because the stash counter is not an
item row. That is consistent, but it means the sweep's coin invariant would
need extending if stash counters ever hold currency.
