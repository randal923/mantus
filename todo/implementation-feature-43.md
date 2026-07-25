# Feature 43 — Mantus Store parity completion

Part of [Todo 12 — Economy: shops, banking, depot, trade, and market](todo-12.md).

Coin grants, item products delivered to the inbox, refunds and coin history
shipped 2026-07-25 — see the
[completed log](completed/implementation-feature-43-completed.md). This file
tracks only what is still open.

## Remaining work

- **Real-money purchase path.** Coins can now be granted by an operator and
  spent, but nothing turns money into coins. That needs a payment provider,
  webhook verification, and a grant keyed by the provider's transaction id
  (the `request_key` column already exists for exactly this). Until then
  `/coins` is a development surface, not a revenue one.
- **Transferable coin balances.** Coins are account-scoped and cannot move
  between accounts. Canary gifting needs a transfer op with both legs in one
  transaction, plus an anti-abuse policy.
- **Client UI.** `store-history-state` has no panel;
  `client/components/store/` shows the catalog only. The coin-history list and
  the "delivered to your inbox" affordance for `deliveredToInbox` are both
  unbuilt.
- **Catalog breadth.** Two categories exist (premium time, a few useful items).
  Expanding it is content, not code.
- **A load-time catalog gate.** Nothing asserts every offer's `itemTypeId`
  exists in the pinned catalog and is pickupable; a bad id currently fails on
  first purchase rather than at boot. Mirror `loadShopCatalogs`'s validation.

## Dependencies

- Feature 96 (admin tooling) — the grant/refund surface should move behind
  real operator authorization once that exists; `/coins` and `/storerefund`
  are dev-only GM commands today.
