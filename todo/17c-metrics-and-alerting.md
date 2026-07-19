# Metrics, dashboards, and alerting

Part of [`17-operations-and-security`](17-operations-and-security.md).
Hardening runs alongside every feature and is required before public access.

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

## Required tests

- [ ] Metric label cardinality stays bounded; no per-player/item ids as labels.
- [ ] Telemetry exporter failure/backpressure does not affect game correctness.
- [ ] Metrics/dashboard endpoints are not publicly accessible.

[Back to overview](README.md)
