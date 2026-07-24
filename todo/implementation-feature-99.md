# Feature 99 — Database audit and recovery

Part of [Todo 18 — Operations, observability, and security](todo-18.md).

## Why
The audit log is the anti-dupe reconciliation source (charter rules 11 and 12), but today there are no least-privilege roles, no tamper-evidence, no partitioning/retention, no automated backups or restore drills, and no reconciliation jobs. Partial reality: parameterized queries are repo policy, and economy audit rows are written in-transaction via `audit_log` with event-type check constraints (migrations 004/012/013/016/018/030).

## Remaining work

### Database security posture
- Least-privilege DB roles, encrypted connections/backups, migration locks/checksums, transaction timeouts, tested pool limits.
- Make the audit log tamper-evident or access-restricted.

### audit_log growth management
- Partition by time range; retention with archival to cold storage — never plain deletion, the log is the anti-dupe reconciliation source; keep hot-path inserts cheap.

### Backups, restore drills, and reconciliation jobs
- Automate WAL archiving/PITR independent of game-server shutdown; regularly test restore into an isolated environment; reconcile audit totals/items after restore before allowing connections (charter rule 12).
- Conservation/reconciliation jobs: item instance uniqueness, owner location validity, gold/escrow totals, market fills, rare serials.
- Document crash recovery and the accepted non-economy durability window.

## Implementation
- Role setup plus SSL in deployment env/pool config (`server/src/index.ts`); statement/transaction timeouts as pool defaults. Tamper-evidence: revoke UPDATE/DELETE on `audit_log` from the game role.
- Migration converting `audit_log` to declarative range partitioning. NOTE: the event-type check constraint is drop-and-recreated by many migrations (012/013/016/018/030) — the partitioning migration must preserve that pattern. Archival job as a `tools/` ops script.
- WAL archiving is infra; reconciliation as SQL jobs (`tools/` scripts or `server/db/` queries) cross-checking `items` uniqueness/locations and bank/escrow/market balances against `audit_log` sums. Overlaps Feature 44 (conservation metrics); drift results feed Feature 95's dashboards.

## Tests
- Restore into an isolated environment plus reconciliation passes before connections are allowed.
- Reconciliation jobs detect injected violations: duplicate item, negative balance, orphaned escrow (against the docker `playtest` DB).
- Pool limits and transaction timeouts behave as configured.

## Dependencies
- Feature 98 (deployment configuration; durability-window documentation).
- Overlaps Feature 44 (conservation metrics); drift feeds Feature 95.
