# Feature 43 (client) — Mantus Store history and inbox-delivery affordance

Part of the [client backlog](README.md). Server side shipped:
[done.md record](../done.md).

## Why
Coin grants, item products, refunds, and the coin history all ship
server-side, but `store-history-state` has no panel —
`client/components/store/StoreModal.tsx` shows the catalog only. A player
cannot see their coin ledger, and a purchase delivered to the inbox
(`deliveredToInbox`) gives no cue about where the item went.

## Remaining work
- A History tab in `StoreModal`: request the history (paged, bounded by the
  schema), render each ledger row (grant/purchase/refund, amount, balance
  after, timestamp) with localized labels.
- The "delivered to your inbox" affordance on item purchases: a confirmation
  line/toast telling the player the goods are in their depot inbox, driven by
  the `deliveredToInbox` field on the purchase result — no polling.
- Locale keys: `store.history.*` and the delivery wording, in both locale
  files.

## Implementation
- Add the `store-history-state` branch in the matching
  `client/components/game-window/messages/handle*Message.ts` (own-account
  state) plus a store field; an unhandled type falls through silently, so add
  branch and field together.
- `GameClient` needs `getStoreHistory(page)` if not present; keep pages
  bounded to the protocol limits.
- Amounts are integers from the server — render as-is, never recompute
  balances client-side.

## Tests
- Storybook: history with mixed row kinds and an empty state.
- Unit test for the row-formatting helper in `client/lib/store/`.

## Dependencies
None; protocol and server ship. The real-money purchase path is server-side
work and stays with [Feature 43](../todo-8.md).
