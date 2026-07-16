# Database, audit, and recovery

Part of [`16-operations-and-security`](16-operations-and-security.md).

## Database, audit, and recovery

- [ ] Use parameterized queries, least-privilege database roles, encrypted
  connections/backups, migration locks/checksums, transaction timeouts, and
  tested connection-pool limits.
- [ ] Append economy and moderation audit events in the same transaction as the
  authoritative change. Make the audit log tamper-evident or access-restricted.
- [ ] Plan for `audit_log` growth before it becomes the largest table: it is
  append-only and will dwarf `items`. Partition it by time range, define a
  retention window with archival to cold storage (never plain deletion — the
  log is the anti-dupe reconciliation source), and keep hot-path inserts cheap
  (no extra indexes beyond what reconciliation queries need).
- [ ] Automate PostgreSQL WAL archiving/point-in-time backups independently of
  game-server shutdown, and regularly test restore into an isolated
  environment. Reconcile audit totals/items after restore before allowing
  connections.
- [ ] Add conservation/reconciliation jobs for item instance uniqueness, owner
  location validity, gold/escrow totals, market fills, and rare serials.
- [ ] Document crash recovery for in-memory character state and what durability
  window is accepted for non-economy snapshots.

## Required tests

- [ ] Backups restore successfully and item/gold/audit reconciliation passes.
- [ ] Reconciliation jobs detect an injected conservation violation (duplicate
  item, negative balance, orphaned escrow).

[Back to overview](README.md)
