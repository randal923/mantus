# Todo 12 — Economy: shops, banking, depot, trade, and market

The economy core has shipped (see [done.md](done.md)): the first Mantus Store slice (account-scoped coins, Premium Time catalog, atomic debit + entitlement renewal, coin ledger + audit); the canonical carried-money/bank model with all four bank exploit tests green; NPC shops with the full pinned catalog import (8,368 executable offers) and all exploit tests; depot/inbox/mail/stash/reward delivery with a memory-authoritative online lane; player trade with a full state machine, SERIALIZABLE commit, and all four exploit tests; and the market with durable escrow, atomic match/fill/cancel, and all five exploit tests. What remains is parity completion (store catalog and grants, bank keyword flows and live notify, shop bank fallback and backpack destinations, trade and market long-tail parity), hardening of accepted trade-offs (the shared 40001-retry gap, depot live resync), and runtime conservation monitoring.

Standing rules for this area: never touch more than one economy-relevant system per PR; every money/item move carries its audit entry in the same transaction that performs it.

## Remaining features

- [ ] **Feature 43 — Mantus Store parity completion** — Authorized coin grant path, transferable balances + history UI, full catalog with inbox delivery of goods, refunds. See [implementation](implementation-feature-43.md).
- [ ] **Feature 44 — Currency conservation metrics and reconciliation** — Runtime conservation checks and periodic reconciliation sweeps as the standing defense against undiscovered dupes. See [implementation](implementation-feature-44.md).
- [ ] **Feature 45 — Bank parity and UX gaps** — Keyword flows, live transfer notification, town restriction, backpack-destination withdrawals, travel fare fallback, and the BankService helper-dedup refactor. See [implementation](implementation-feature-45.md).
- [ ] **Feature 46 — NPC shop parity completions** — Sale proceeds bank fallback, buy into backpacks/shopping bags, and a durable stock restock schedule. See [implementation](implementation-feature-46.md).
- [ ] **Feature 47 — Depot/market transaction hardening** — Shared bounded 40001-retry fix, live resync instead of disconnect on persist failure, and the recorded persistence-lane trade-offs. See [implementation](implementation-feature-47.md).
- [ ] **Feature 48 — Player-trade parity completions** — Ground-item offers, reserved-offer visibility, per-item look, orphan-restore to inbox, store/unique/house-tile restrictions. See [implementation](implementation-feature-48.md).
- [ ] **Feature 49 — Market parity completions** — Stash-sourced sells, full marketable-catalog browser, pristineness extensions, live counterparty notification, expiry full-inbox decision, UI polish. See [implementation](implementation-feature-49.md).

[Back to overview](README.md)
