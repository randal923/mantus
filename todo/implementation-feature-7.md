# Feature 7 — Production world-item seed reconciliation

Part of [Todo 4 — Rendering and animation](todo-4.md).

## Why
Re-running the map converter changes the world-item seed hash; persisted world-item delta rows from the old `items.bin` make the server throw "persisted world items require reconciliation" at startup. This was fixed by hand once in dev; production needs a first-class audited path (charter rule 12: never restore or hand-edit production data without reconciling the audit log).

## Remaining work
- `server/scripts/cleanupPartialWorldSeed.ts` refuses to run once real gameplay data exists; the `items_immutable_identity` trigger blocks rewriting `seed_map_version`.
- Dev procedure to codify: verify each stale row's seed key still exists in the new `items.bin`, then DELETE rows in one transaction with `item-destroyed` audit entries. Done manually 2026-07-20 for 5 door rows.
- Build a first-class production reconciliation path.

## Implementation
New script — e.g. `server/scripts/reconcileWorldSeed.ts`, alongside `cleanupPartialWorldSeed.ts` and `migrate.ts` — codifying the dev procedure:
- Single ACID transaction.
- Validate each stale row's seed key against the new `items.bin`.
- Delete/remap with `item-destroyed` audit entries written in the same transaction (charter rule 11).
- Fail closed on any unclassifiable row — abort the whole transaction.
- Run only offline (server down), never from the game tick.

## Tests
- pg-backed test: reconciliation writes matching audit rows and leaves no orphans.
- pg-backed test: an unclassifiable row aborts the whole transaction (nothing partially applied).

## Dependencies
- Items/audit-log infrastructure — already present: `server/db/migrations/004_audit_log.sql`, `005_items.sql`, `006_item_identity_error.sql`.
- Related to Feature 99 (db audit/recovery operations).
