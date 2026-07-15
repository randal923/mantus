# Production operations and security

Hardening runs alongside every feature and is required before public access.
The [`authentication follow-ups`](17-auth-follow-ups.md) track the currently
known auth-specific gaps.

## Network and resource limits

- [ ] Deploy only behind TLS (`wss://`) with an explicit allowed-origin policy,
  trusted proxy configuration, secure headers, and no secrets in browser code.
- [ ] Enforce maximum WebSocket frame/message size before parsing, per-message
  zod validation, per-intent rates, aggregate connection rates, outbound queue
  limits, idle timeouts, and connections per IP/account.
- [ ] Disconnect clients that sustain limit violations; bound all ids, indexes,
  counts, paths, chat text, searches, containers, market queries, and region
  requests.
- [ ] Keep one authoritative process per world until an explicit partitioning
  design exists. Multiple unsynchronized server replicas would break tick,
  occupancy, session, item, and economy invariants.

## Observability and administration

- [ ] Add structured logs that omit credentials/tokens/private chat and include
  safe correlation ids, session/character ids, message kind, tick timing, and
  outcome category.
- [ ] Add metrics/alerts for tick duration/backlog, connections/rates/drops,
  visibility counts, spawn/AI/pathfinding budgets, DB latency/errors, unsaved
  characters, transaction conflicts, audit failures, and reconnect storms.
- [ ] Build authenticated, role-authorized admin actions for kick, ban, mute,
  teleport, content/event controls, and read-only inspection. Audit every action
  with actor, target, reason, before/after, and result.
- [ ] Never use hand-edited production data as routine administration.

## Continuous durability and deployment

- [ ] Make production correctness independent of a scheduled global save,
  global map clean, or daily process restart. A server that remains online for
  weeks must persist and advance the same durable state correctly.
- [ ] Define and monitor the accepted durability window for each class of
  state: bounded asynchronous snapshots for non-economy character state, and
  immediate committed transactions before acknowledgement for economy,
  ownership, rewards, and other non-repeatable outcomes.
- [ ] Add graceful draining: stop new sessions, stop accepting new gameplay
  work, flush dirty character snapshots with a deadline, require the unsaved
  character metric to reach zero, close connections, and then stop the world
  process.
- [ ] Make startup reconstruct transient world indexes from PostgreSQL and
  versioned static content. Do not require a clean prior shutdown for
  correctness.
- [ ] Prefer online/backward-compatible migrations and rolling infrastructure
  changes. Use an explicit maintenance window only when a map, protocol, or
  incompatible migration genuinely requires one—not as a daily persistence
  mechanism.

## Database, audit, and recovery

- [ ] Use parameterized queries, least-privilege database roles, encrypted
  connections/backups, migration locks/checksums, transaction timeouts, and
  tested connection-pool limits.
- [ ] Append economy and moderation audit events in the same transaction as the
  authoritative change. Make the audit log tamper-evident or access-restricted.
- [ ] Automate PostgreSQL WAL archiving/point-in-time backups independently of
  game-server shutdown, and regularly test restore into an isolated
  environment. Reconcile audit totals/items after restore before allowing
  connections.
- [ ] Add conservation/reconciliation jobs for item instance uniqueness, owner
  location validity, gold/escrow totals, market fills, and rare serials.
- [ ] Document crash recovery for in-memory character state and what durability
  window is accepted for non-economy snapshots.

## Testing and release gates

- [ ] Add malformed/fuzz protocol tests, replay/race tests, slow-client/backpressure
  tests, auth/authorization integration tests, and content importer fixtures.
- [ ] Add deterministic tick simulations and load tests for player movement,
  dense visibility, animated client regions, spawns, AI/pathfinding, combat,
  inventory races, chat floods, and market contention.
- [ ] Pin dependencies/content manifests and run typecheck, lint, unit,
  integration, migration, build, and provenance checks in CI using Yarn.
- [ ] Define staged rollout, maintenance mode, rollback-forward migration policy,
  incident response, moderation escalation, and security-contact procedures.
- [ ] Add failure-injection tests for abrupt process death between in-memory
  mutation and asynchronous snapshot persistence. Verify the documented
  non-economy loss window while item, gold, reward, and audit commits remain
  atomic and cannot duplicate.
- [ ] Add restart tests proving durable schedules, mutable world state, and
  ownership rebuild correctly without running a global-save routine first.

## Production checklist

- [ ] TLS/WSS, allowed origins, secure proxy headers, and production environment
  validation are enabled.
- [ ] Supabase captcha, production auth rate limits, session expiry, and ban/mute
  paths are configured and tested.
- [ ] Protocol size/rate/backpressure limits and visibility filters pass abuse
  tests.
- [ ] Backups restore successfully and item/gold/audit reconciliation passes.
- [ ] Graceful deploys reach zero unsaved characters, and crash recovery passes
  without relying on a daily global save or scheduled restart.
- [ ] Metrics, alerts, logs, admin authorization, and audit review are live.
- [ ] No known character/item/economy race is missing its regression test.

[Back to overview](README.md)
