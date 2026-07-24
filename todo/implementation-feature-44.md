# Feature 44 — Currency conservation metrics and reconciliation

Part of [Todo 12 — Economy: shops, banking, depot, trade, and market](todo-12.md).

## Why
There is no runtime monitoring that gold and tracked rares stay conserved. Per-feature exploit tests catch known dupes; a conservation sweep is the standing defense against undiscovered ones.

## Remaining work
- Runtime conservation checks/metrics: currency created, destroyed, transferred.
- Reconciliation jobs: periodic sweep comparing item rows against `bank_ledger` and `audit_log` deltas, alerting on drift.

## Implementation
- New job/module under `server/src/economy/` that reads `bank_ledger`, `audit_log`, and coin item rows via parameterized queries only (charter rule 7).
- Runs off-tick on a schedule so it never blocks or mutates live game state; it is read-only — any repair action goes through normal audited transactions, never hand edits (charter rule 12).
- Alert/log on drift; surface metrics for operators.

## Tests
- Seeded set of mutations (spends, grants, transfers, trades) reconciles to zero drift.
- An injected orphan row (item without matching ledger/audit trail) is flagged by the sweep.

## Dependencies
- Audit-log completeness across economy systems (shipped).
- Overlaps Feature 99 (db audit/recovery — reconciliation jobs); coordinate so one job framework serves both.
