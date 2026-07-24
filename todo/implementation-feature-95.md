# Feature 95 — Metrics and alerting

Part of [Todo 18 — Operations, observability, and security](todo-18.md).

## Why
Nothing exists: no metrics export, no dashboards, no alerts, no health endpoints, no client telemetry. Operating the live game blind makes every other hardening feature unverifiable.

## Remaining work

### Core runtime + persistence metrics export
- Process/runtime: CPU/RSS/heap/GC/event-loop lag, uptime/restarts, tick duration/overruns/backlog, session counts, connection accepts/rejects/disconnect reasons, inbound rates/violations, outbound queue bytes, heartbeat failures.
- DB/persistence: pool active/idle/waiting, query/transaction latency, errors by category, retries, deadlocks, version conflicts, dirty/pending/failed saves, oldest unsaved age, shutdown flush duration, unsaved character count.
- Cardinality discipline: no account/session/character/item ids in labels.

### Feature/gameplay metrics
- Population by vocation/level bands, movement accept/reject reasons, map/region/cache behavior, creature/spawn/AI budgets, combat/death rates, item/gold sources and sinks, transfer conflicts, loot/market/trade volume, quest/event progress, reconciliation drift.

### Dashboards, SLOs, and alerting
- Dashboards: world health, tick/runtime, sessions/auth, Postgres/persistence, protocol abuse, client/reconnect health, gameplay, economy conservation, scheduled events, releases, incident drill-down joining metrics↔logs↔audits.
- SLOs/alerts: tick overruns, event-loop stalls, crash loops, pool exhaustion, elevated errors/auth failures, unsaved state age/count, save/audit failures, abuse spikes, reconnect storms, economy drift, missing telemetry.

### Client telemetry ingestion
- Ingest startup/render/asset failures, invalid server messages, disconnect/close categories, reconnect attempts, resource exhaustion, client build/browser class.
- Never ingest access tokens or private server projections.

### Observability-pipeline health + endpoint security
- Pipeline self-monitoring: dropped/sampled counts, exporter queue depth/failures, scrape freshness, ingestion cost, alert delivery health; game correctness must be independent of telemetry.
- Separate liveness/readiness/metrics endpoints; readiness includes tick health, dependency availability, draining state, unsafe save backlog; metrics/dashboards not public and not sharing gameplay auth.
- Operator roles on dashboard/log/trace access; audit sensitive drill-downs; cross-world isolation tests; exported dashboards contain no secrets.

## Implementation
- New `server/src/metrics/` module; instrument `server/src/TickLoop.ts`, `GameServer.ts`/`Session.ts`, the pg pool in `index.ts`, and the character-save path (the perf pass's dirty-flag saves are the hook for save metrics).
- prom-client is the obvious exporter but is a **new dependency — ask before adding**.
- Gameplay counters in `MovementHandler.ts`, `server/src/ai/`, combat, market/trade/bank; reconciliation drift comes from Feature 99's jobs.
- Dashboards/alerts as infra config (e.g. Grafana) versioned in-repo; alert-rule tests roll into Feature 100's gates.
- Client telemetry: rate-limited HTTP endpoint (Next Route Handler or a server endpoint), zod-validated, receiving Feature 92's reporter payloads.
- Health endpoints as a small HTTP listener in `server/src/index.ts` on an internal port; readiness wired to TickLoop, pool, and drain state.

## Tests
- Label-cardinality assertion (no per-entity ids in labels).
- Exporter failure does not affect the game (correctness independent of telemetry).
- Telemetry endpoint rejects unvalidated/oversized/over-rate payloads.
- Cross-world isolation on dashboard/log access; exported dashboards contain no secrets.

## Dependencies
- Feature 92 (client reporter is the telemetry source).
- Feature 94 (correlation for incident drill-down dashboards).
- Feature 98 (drain state as readiness input).
- Feature 99 (reconciliation-drift metrics).
- Feeds Feature 97 (save-failure alerting) and Feature 100 (alert-rule tests).
