# Feature 44 — Currency conservation metrics and reconciliation

Part of [Todo 12 — Economy: shops, banking, depot, trade, and market](todo-12.md).

Shipped 2026-07-25 — see the
[completed log](completed/implementation-feature-44-completed.md). A read-only
sweep runs off-tick every five minutes and checks the coin pot against audited
mint/burn flow, bank balances against their ledger chain, and coin rows against
their audit trail, alerting on drift.

## Remaining work

- **Escrow is reported, not re-derived.** It relies on the `market_offers`
  check constraint pinning `escrow_balance` to `remaining_amount × unit_price`.
  If escrow ever stops being that pure function, add a fourth invariant.
- **Metrics have no operator surface yet.** `CurrencyConservationRunner.report`
  holds the last sweep; nothing exposes it. Wire it into Feature 96's admin
  tooling rather than inventing a second surface.
- **Tracked rares are not covered.** Only the three coin types are. Extending
  the same shape to a rare-item watchlist is straightforward once one exists.

## Dependencies

- Overlaps Feature 99 (db audit/recovery — reconciliation jobs); its job
  framework should reuse `CurrencyConservationRunner`'s shape rather than
  growing a second scheduler.
- Feature 96 (admin tooling) for the operator-facing metrics surface.
