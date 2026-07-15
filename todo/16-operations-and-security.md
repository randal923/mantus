# Production observability, operations, error handling, and security

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

## Structured logging and game-event visibility

- [ ] Define a versioned structured-event catalog with timestamp, severity,
  environment, world, build/content version, event name, outcome, duration,
  safe correlation id, and relevant session/account/character/entity ids.
  Keep field names and error categories stable enough for dashboards and
  incident queries.
- [ ] Replace direct `console.*` calls with one configured structured logger.
  Preserve `Error` name/message/stack/cause internally, support child context,
  and flush fatal records with a strict deadline during shutdown.
- [ ] Log important lifecycle and security outcomes: startup/config/migration,
  connection admission, authentication category, character create/select,
  login/logout/reconnect/kick, persistence retry/failure/recovery, protocol
  strikes/rate limits, admin actions, deployments, shutdown, and crashes.
- [ ] Define feature-local diagnostic events as systems land: movement
  rejection categories, deaths, progression awards, loot creation, item
  transfers, trades/market fills, quest transitions, world events, house rent,
  and conservation failures. Economy/admin/security history also goes to its
  durable audit table; diagnostic logs are not a substitute for audit data.
- [ ] Do not log credentials, JWTs, raw authorization headers, private chat,
  complete inventory/quest payloads, or arbitrary inbound packets. Hash or
  truncate network identifiers where appropriate and define field-level
  redaction tests.
- [ ] Do not synchronously log every movement tick or packet. Use aggregate
  counters/histograms and bounded sampling for high-volume success paths while
  retaining all errors, security events, audit events, and anomalous outcomes.
  Logging backpressure or backend failure must never stall the game tick.
- [ ] Centralize logs with access control, encryption, retention/deletion,
  searchable correlation, release/source-map metadata, storage budgets, and an
  operator timeline that can reconstruct an incident without exposing another
  player's private state.
- [ ] Add sampled traces for expensive or multi-stage paths such as auth,
  character entry, persistence, database transactions, content loading, and
  admin operations. Propagate correlation across stages without tracing every
  movement tick or adding network-controlled high-cardinality attributes.

## Metrics, dashboards, and alerting

- [ ] Export bounded-cardinality metrics for process CPU/RSS/heap/GC/event-loop
  lag, uptime/restarts, tick duration/overruns/backlog, online/authenticated/
  in-world sessions, connection accepts/rejects/disconnect reasons, inbound
  message rates/violations, outbound queue bytes, and heartbeat failures.
- [ ] Export database and persistence metrics for pool active/idle/waiting,
  query/transaction latency, errors by stable category, retries, deadlocks,
  version conflicts, dirty/pending/failed saves, oldest unsaved age, shutdown
  flush duration, and unsaved character count.
- [ ] Add feature metrics as systems land: population by vocation/level bands,
  movement accept/reject reasons, map/region/cache behavior, creature/spawn/AI
  budgets, combat/death rates, item/gold sources and sinks, transfer conflicts,
  loot/market/trade volume, quest/event progress, and reconciliation drift.
- [ ] Build dashboards for world health, tick/runtime performance, sessions and
  authentication, PostgreSQL/persistence, protocol abuse, client/reconnect
  health, gameplay systems, economy conservation, scheduled events, releases,
  and an incident drill-down joining metrics to correlated logs and audits.
- [ ] Define service-level objectives and actionable alerts for tick overruns,
  event-loop stalls, crash loops, DB pool exhaustion, elevated errors/auth
  dependency failures, unsaved state age/count, save/audit failures, protocol
  abuse spikes, reconnect storms, economy drift, and missing telemetry.
- [ ] Keep account/session/character/item ids out of metric labels to prevent
  unbounded cardinality. Use structured logs or traces for individual
  investigation, and aggregate dashboards by bounded dimensions such as world,
  build, operation, result, vocation, region, or error category.
- [ ] Add bounded, redacted client telemetry for startup/render/asset failures,
  invalid server messages, disconnect/close categories, reconnect attempts,
  resource exhaustion, and client build/browser class. Never send access
  tokens or private server projections back as telemetry.
- [ ] Monitor the observability pipeline itself: dropped/sampled log counts,
  exporter queue depth/failures, scrape freshness, ingestion/storage cost, and
  alert delivery health. Game correctness must not depend on telemetry being
  available.
- [ ] Expose separate liveness, readiness, and internal metrics endpoints.
  Readiness must include tick health, dependency availability, draining state,
  and unsafe save backlog; metrics and dashboards must not be publicly
  accessible or share an authentication surface with gameplay clients.
- [ ] Protect dashboard/log/trace access with operator roles and audit access to
  sensitive drill-downs. Test that one world/environment cannot accidentally
  query another and that exported dashboards contain no secrets or private
  player payloads.

## Administration

- [ ] Build authenticated, role-authorized admin actions for kick, ban, mute,
  teleport, content/event controls, and read-only inspection. Audit every action
  with actor, target, reason, before/after, and result.
- [ ] Never use hand-edited production data as routine administration.

## Known error-handling gaps (audited 2026-07-15)

- [ ] Add a top-level tick failure policy. A synchronous exception currently
  escapes the interval callback without structured context or controlled
  shutdown. Record the failing phase/tick, stop accepting work, and terminate
  for supervisor restart; do not continue ticking or blindly persist possibly
  inconsistent mid-tick state.
- [ ] Handle WebSocket server and per-socket `error` events, close codes, send
  callback failures, serialization failures, and `bufferedAmount` limits.
  Queue disconnect cleanup through the tick and expose stable close/error
  categories rather than allowing an unhandled emitter error or silent send.
- [ ] Report protocol parse/schema strikes, rate-limit disconnects, full intent
  queues, heartbeat timeouts, and admission rejection reasons through bounded
  counters and sampled logs. These paths currently fail or drop mostly
  silently.
- [ ] Define typed internal error categories separate from public protocol error
  codes, including validation, authorization, conflict, dependency unavailable,
  timeout, retry exhausted, invariant violation, and fatal corruption risk.
  Auth/database outages must not be misclassified internally as bad player
  credentials, while clients still receive non-sensitive messages.
- [ ] Put deadlines/cancellation around token verification, database acquire/
  query/transaction work, shutdown flushes, and other external dependencies.
  Classify retryability centrally and use capped jittered retries or a circuit
  breaker only where replay is safe.
- [ ] Preserve the primary error and cause when transaction rollback, connection
  release, socket close, log export, or shutdown cleanup also fails. Detect and
  classify ambiguous database commit outcomes; never blindly retry a
  non-idempotent economy operation whose commit result is unknown.
- [ ] Make permanent character-save failures operationally recoverable without
  overwriting newer state: export queue depth/oldest age/failure cause, fail
  health checks and alert, retain the latest dirty snapshot, and provide a
  tested retry/reload or controlled disconnect path.
- [ ] Validate every environment/configuration value and required content at
  startup, including numeric bounds and database schema/content compatibility;
  fail once with a structured fatal event rather than entering a partially
  initialized world.
- [ ] Add deliberate `unhandledRejection` and `uncaughtException` reporting that
  treats the process as unsafe, performs only bounded safe cleanup, and exits
  for supervisor restart. Prove fatal reporting itself cannot recurse or hang.

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
- [ ] Add tests for tick exceptions, WebSocket emitter/send failures, dependency
  timeouts, DB pool exhaustion, telemetry exporter failure/backpressure,
  redaction, metric cardinality, alert rules, and fatal shutdown deadlines.

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
- [ ] Structured logs, dashboards, SLO alerts, telemetry-pipeline monitoring,
  admin authorization, and audit review are live and exercised by an incident
  drill.
- [ ] No known character/item/economy race is missing its regression test.

[Back to overview](README.md)
