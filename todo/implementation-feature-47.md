# Feature 47 — Depot/market transaction hardening

Part of [Todo 12 — Economy: shops, banking, depot, trade, and market](todo-12.md).

Shipped 2026-07-25 — see
[completed log](completed/implementation-feature-47-completed.md). The
serialization-retry half was closed earlier by
[Feature 31](completed/implementation-feature-31-completed.md); the
persist-failure live resync closed the rest.

## Documented deviations (no action needed)

- Depot mutations (same-owner deposit/withdraw/stash) are acknowledged before
  DB commit; a crash between memory-apply and persist loses that mutation (no
  dupe possible; memory is rebuilt from DB at login, and now also by the live
  resync). Accepted for latency. Cross-character flows (mail, reward, expiry)
  stay commit-first — keep this split.
- Expiry returns race an online recipient's withdraw for ~1 tick (harmless at
  30-day granularity).
- Mid-login deliveries buffer up to 60 s in `DepotCacheManager` between
  `beginLoad` and `attach` (idempotent id-keyed replay); an aborted login
  relies on TTL expiry. The live resync re-uses the same window.
