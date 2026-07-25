# Feature 49 — Market parity completions

Part of [Todo 12 — Economy: shops, banking, depot, trade, and market](todo-12.md).

Stash-sourced sell offers, the live counterparty push and the order-book
partial-fill input shipped 2026-07-25 — see the
[completed log](completed/implementation-feature-49-completed.md). This file
tracks only what is still open.

## Remaining work

- **Marketable-catalog browser.** The browsable catalog is still "types with
  active offers plus own sellable stock"; Canary browses the full marketable
  catalog from DAT `ATTR.market` metadata, which the importer discards. Needs
  the asset-import pipeline regenerated to keep `ATTR.market` (or an expanded
  `marketCategoryOf.ts`), a paged full-catalog read op in `PgMarketReadOps.ts`
  bounded by `MARKET_LIMITS`, and a client browser list. **Blocked**: the
  importer needs a Canary/DAT source checkout.
- **Store-coin/tier/imbuement pristineness.** Pristineness is still "empty
  attributes, no contained items". Revisit when store coins (Feature 43), forge
  tiers and imbuements (Feature 78) land — each adds attributes that must not
  silently make an item unsellable or, worse, sellable while carrying value.
- **Expiry with a full inbox** defers one hour and retries, vs Canary's
  capacity-bypassing insert. Still an open decision: keep as a documented
  deviation, or add a bypass flag to the expiry op (one transaction + audit
  either way).
- **Selection retention after `market-transacted`.** The client still
  re-requests all pages sequentially, so a selected item on page > 1 briefly
  falls back to the first item. Fix by keeping the prior selection rendered
  from cache until its page arrives.
- **Offer detail has no level/vocation display and no anonymous flag.** Names
  are never exposed here, which is tighter than Canary; parity is optional.

## Dependencies

- Asset-import pipeline regeneration for `ATTR.market` (catalog browser).
- Feature 43 (store coins) and Feature 78 (forge tiers/imbuements) for the
  pristineness extensions.
