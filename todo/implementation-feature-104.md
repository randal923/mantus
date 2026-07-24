# Feature 104 — Atomic quest rewards and quest-log protocol

Part of [Todo 21 — Quests](todo-21.md).

## Why
Quest rewards create items and gold — a prime dupe vector. Reward claims must be idempotent and transactional (charter rule 2), and quest-log state must never leak beyond the owning player (charter rule 6).

## Remaining work
- Reward claims and storage transitions idempotent and transactional with item/gold changes plus audit entries.
- Quest-log state sent only to the owning player.
- Exploit tests: reward replay grants exactly once, including concurrent intents and reconnects; forged storage values/completed flags/reward claims rejected; private quest state not exposed; quest parity reports zero missing definitions/transitions/callbacks.

## Implementation
- Reward transaction in `QuestService` using the single-transaction + `audit_log` pattern; new quest-reward event type via the drop-and-recreate constraint migration pattern (012/013/018/030).
- Quest protocol projections as new zod schemas in `protocol/src/` — schema + max size + rate expectation first, per charter.
- Client quest-log UI in `client/components/`.

## Tests
- Reward replay (concurrent intents, reconnect replay) grants exactly once — write the exploit test first.
- Forged storage values, completed flags, and reward claims rejected.
- Quest-log projection contains only the owning player's state.
- Quest parity report shows zero missing definitions/transitions/callbacks.
- Run against the docker `playtest` DB.

## Dependencies
- Feature 103 (quest/storage platform).
- Audit-log event-type migration pattern shared with Feature 99's partitioning work — coordinate ordering.
