# Feature 54 — World event engine (remaining)

Part of [Todo 14 — Raids and world events](todo-14.md).

The durable engine and the raid import lane shipped 2026-07-25 — see the
[completed log](completed/implementation-feature-54-completed.md).

## Remaining work

- **Import the other global events.** Only the 21 raid revscripts are imported.
  Still unimported: `data/scripts/globalevents` (`encounters.lua`,
  `global_server_save.lua`, `online_record.lua`, `save_interval.lua`,
  `server_initialization.lua`, `update_guild_war_status.lua`) and
  `data-otservbr-global/scripts/globalevents` (spawn sweeps, VIP, world
  update). Each needs the same classify-everything report the raid importer
  emits.
- **Daily resets and boosted rotations.** The engine's schedule table can carry
  them (`next_check_at` + idempotency key), but no content is imported and the
  daily-boundary step kinds do not exist. `daily_reward_shrine.lua` is
  classified `deferred` to this feature in
  `content/canary-world-action-parity.json`.
- **Reward steps.** No pinned raid grants an item or currency, so the engine has
  no reward step kind. When one lands it must commit inside a run-keyed
  transaction (the `character_chest_loot` pattern) so a retry cannot double-pay.
- **Real operator authorization.** `/raid <eventId>` is dev-commands-only, like
  `/coins` and `/storerefund`; it should move behind operator authorization once
  Feature 96 ships. The attempt is already audited.
- **17 raid monster names cannot spawn.** They are absent from the pinned
  creature import (`content/events/canary-raids.json` →
  `unresolvedMonsterNames`), so those stages place nothing. The budget is pinned
  by `worldEventContent.test.ts`; a newer creature import is the fix, not a code
  change.

## Tests

- Restart mid-event is idempotent — **done**.
- Lease prevents double-fire across a simulated crash — **done**.
- Operator controls rejected without authorization and audited when used —
  **partly done** (audited; authorization is dev-only until Feature 96).
- Daily-boundary equivalence online vs across a restart — pending the daily
  content.
- Parity tests over every registered raid/global event — **done for raids**.

## Dependencies

- Feature 96 (admin tooling) for operator authorization.
- Shares durable-scheduling infrastructure with Feature 46's shop restock.
