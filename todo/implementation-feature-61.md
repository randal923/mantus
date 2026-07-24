# Feature 61 — Timed house auctions

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

## Why
Canary sells unowned houses through timed auctions rather than first-come purchase. The buy/transfer/rent core shipped; auctions are the missing acquisition path.

## Remaining work
- Auction state, bid intents, auction close on expiry, winning-bid settlement, loser refunds.

## Implementation
- Auction state migration in the house schema.
- Bid intents in `protocol/src/house.ts` (zod schema + size/rate limits before the handler).
- Bid/close logic in `server/src/house/HouseService.ts` + `server/src/house/PgHouseStore.ts`, with eligibility (level, premium, one-house rules) re-checked at bid and again at close execution time.
- Expiry handled through the existing tick-driven durable schedule scan (the same replay/crash-safe loop that drives rent), so closes are exactly-once.
- Winning bid escrowed via bank legs in one serializable transaction with audit rows (charter rules 2 and 11).

## Tests
- Racing bids resolve to exactly one winner; no bid applied twice.
- Auction close fires exactly once across restart/replay.
- Losers refunded in full; gold conservation across escrow/settlement/refunds in `PgHouseStore.integration.test.ts`.

## Dependencies
- Bank core (shipped, todo-12).
- Existing house durable-schedule loop (shipped).
