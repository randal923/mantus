# Feature 43 — Mantus Store parity completion

Part of [Todo 12 — Economy: shops, banking, depot, trade, and market](todo-12.md).

## Why
The first Mantus Store slice shipped account-scoped coins and a Premium Time catalog, but there is currently no legitimate way to add coins to an account, only one product exists, and purchased goods cannot be delivered as items. The store is not a real economy surface until grants, catalog, delivery, and refunds exist.

## Remaining work
- Authorized real-money/admin coin grant path — today there is no legitimate way to add coins.
- Transferable coin balances plus a coin-history UI.
- Full store catalog — only Premium Time exists today.
- Inbox delivery of purchased goods; grants beyond Premium Time.
- Refunds.

## Implementation
- Extend `server/src/store/MantusStoreService.ts` and `server/src/store/PgMantusStore.ts`. All mutations run in SERIALIZABLE transactions; every coin debit/grant writes the coin ledger and `audit_log` in the same transaction that performs it (security charter rule 11).
- Item-granting products deliver via the depot/inbox lane, following the `server/src/depot/DepotMailOps.ts` / `server/src/depot/DepotRewardOps.ts` pattern: id-keyed idempotent upserts so a retried delivery cannot double-grant.
- Admin grant path is authorized against operator identity (never an account id from the message body) and audited.
- New/extended zod message schemas in `protocol/` with max size and rate expectations defined before the handlers, per the charter.

## Tests
- Replayed grant/purchase cannot double-credit coins or entitlements.
- Concurrent purchases cannot drive a coin balance negative.
- Failed item delivery rolls back the coin debit — one ACID transaction, zero partial state.

## Dependencies
- Depot/inbox delivery lane (shipped, old todo 11c).
- Feature 96 (admin tooling — operator/admin authorization for the grant path).
