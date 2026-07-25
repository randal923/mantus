# Feature 61 — completed

Timed house auctions, from
[implementation-feature-61.md](../implementation-feature-61.md).

Cross-links: [todo-15.md](../todo-15.md).

---

## 2026-07-25 — Bid/close auctions on the durable house schedule

**Problem.** Unowned houses could only be bought first-come. Canary sells them
through timed auctions, which was the missing acquisition path.

**What changed.** `house_auctions` (migration `046_house_auctions.sql`) holds
one row per running auction. The row *is* the escrow record — the bid leaves
the bidder's bank in the same transaction that accepts it — and it is *also*
the lease for the close, deleted in the same transaction that inserts the
`houses` row. That makes the close exactly-once across crash and replay: a
second scan finds no row and returns `skip`.

Gold is conserved on every path. An accepted bid refunds the standing bid to
its holder inside the same serializable transaction that escrows the new one
(`house-bid-escrow` / `house-bid-refund` ledger rows, one `house-auction-bid`
audit row). Re-raising your own bid escrows only the difference. At close the
winner's escrow is consumed by the purchase; if the winner no longer qualifies
— level, premium, one-house rule, all re-read from database truth inside the
close transaction, never trusted from bid time — or if the house was bought
directly meanwhile, the full escrow is credited back.

`HouseService` mirrors running auctions in memory (loaded at boot through
`loadAuctions`, updated only from tick outcomes) so `house-buy` can reject a
house under auction with `auction-active` rather than stranding the bids, and
so the public auction row (`bid`, `bidderName`, `endsAt`, viewer-scoped `mine`)
rides along on both `house-state` and every `house-list` entry.

**Files touched.**
`server/db/migrations/046_house_auctions.sql`,
`server/src/house/{HouseService,HouseStore,PgHouseStore,MemoryHouseStore,projectHouseStateFor}.ts`,
`server/src/house/sql/{houseAuctionRowsQuery,houseAuctionRowForUpdateQuery,insertHouseAuctionQuery,updateHouseAuctionBidQuery,deleteHouseAuctionQuery,dueHouseAuctionIdsQuery,houseBidderEligibilityQuery}.ts`,
`server/src/economy/appendBankLedger.ts`, `server/src/GameServer.ts`,
`protocol/src/{house,clientMessages}.ts`,
`client/components/house/{HouseAuctionSection,HouseModal,HouseBrowserSection}.tsx`,
`client/components/game-window/{GameCommunityOverlays,GameNotifications}.tsx`,
`client/components/game-window/{messages/handleCommunityMessage.ts,types/HouseToast.ts}`,
`client/lib/net/GameClient.ts`, `client/locales/{en,pt-BR}.json`.

**How it was verified.** `HouseService.test.ts` — escrow/outbid refund, bid
floor, direct-purchase rejection under auction, exactly-once close across two
scans, full refund when premium lapsed between bid and close.
`PgHouseStore.integration.test.ts` — racing bids resolve to exactly one winner
with gold conserved, `closeAuction` replay returns `skip` with one settled
audit row and no refund, lapsed-eligibility close refunds every coin.

**Residual risk.** A house is either auctioned or bought directly, decided by
whether an auction is open; Canary auctions every unowned house. Keeping the
direct-purchase path is a deliberate deviation from the pinned baseline (it was
already shipped) and is recorded here rather than removed.
