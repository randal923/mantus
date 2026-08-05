# Gap 4: 5-minute economy sweeps full-scan `audit_log` and `items`

**Severity:** medium (grows with uptime; DB CPU + I/O)
**Verified:** 2026-08-05 — `grep "CREATE INDEX" server/db/migrations/*.sql`
matches nothing for `audit_log`, and no `items(item_type_id)` index exists
(migrations run through `074_market_history_rarity.sql`).

## Evidence

- `server/src/economy/sql/currencyAuditFlowQuery.ts` filters `audit_log` (the
  fastest-growing table, ~56 write sites, append-only) by `occurred_at` +
  `event_type` with no matching index → full scan every 5 minutes.
- `server/src/economy/sql/currencySupplyQuery.ts` and
  `orphanCoinRowsQuery.ts` aggregate `items` by `item_type_id` with no index →
  two more full scans every 5 minutes.

## Recommended fix

```sql
CREATE INDEX CONCURRENTLY audit_log_coin_flow_idx
  ON audit_log (occurred_at)
  WHERE event_type IN ('item-created', 'item-destroyed');
-- or BRIN on occurred_at, since the column is append-ordered
CREATE INDEX CONCURRENTLY items_item_type_id_idx
  ON items (item_type_id) INCLUDE (count);
```

Plan a partition/retention policy for `audit_log` as a follow-up; it only
grows.
