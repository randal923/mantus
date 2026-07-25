# Feature 46 — NPC shop parity completions

Part of [Todo 12 — Economy: shops, banking, depot, trade, and market](todo-12.md).

The three recorded gaps — sale-proceeds bank fallback, buying into backpacks,
and the stock restock schedule — shipped 2026-07-25; see the
[completed log](completed/implementation-feature-46-completed.md). This file
tracks only what is still open.

## Remaining work

- **Carry capacity is re-checked only in the tick precheck, not inside the
  transaction.** `ShopPrechecks` compares projected weight against
  `capacityMax` in the tick immediately before the transaction is enqueued, so
  the window is small, but it is still stale validation (charter rule 4). The
  fix is cheap now that grants descend the carried subtree: the transaction
  already loads every owned row via `coinOwnedItemsQuery`, so weight can be
  summed from the catalog inside it — `capacityMax` needs to ride along on the
  server-built `ShopPurchaseRequest` (server-computed from level/vocation/wheel,
  never client-supplied).
- **No pinned catalog entry declares `stock`.** The restock plumbing, its
  schema, and its tests exist and are inert. Canary's pinned shops have no
  finite stock, so enabling it is a content decision, not a code one.
- **Shopping bags are not sold as containers.** Canary lets some NPCs sell a
  shopping bag that the purchase then fills; here a purchased container is an
  ordinary item and grants never target it in the same transaction that created
  it.

## Dependencies

- Feature 45 reuses the shipped backpack destination planning for withdrawals.
