# Feature 55 — Party analyzer

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

Shipped 2026-07-25 — see the
[completed log](completed/implementation-feature-55-completed.md).

## Accepted gaps

- The `market` price mode uses the item type's catalog `worth`; Canary reads
  live market statistics. A market price index would need a per-type average
  from `market_offers` history.
- Supplies count runes, ammunition and potions. Food and other consumables are
  not observed.
