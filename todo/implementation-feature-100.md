# Feature 100 — Testing and release gates

Part of [Todo 18 — Operations, observability, and security](todo-18.md).

## Why
This is the final pre-launch gate. Two prose baselines exist — a 4,000-player controlled protocol capacity result and an isolated 1,900-active-hotspot-monster gate — but both are explicitly insufficient: never combined, never on production-like infra. Everything else (fuzz suites, staging gates, CI beyond migrations, the launch runbook) does not exist.

## Remaining work

### Adversarial + deterministic test suites
- Malformed/fuzz protocol tests, replay/race tests, slow-client/backpressure tests, auth/authorization integration tests, content importer fixtures.
- Deterministic tick simulations and load tests: movement, dense visibility, animated regions, spawns, AI/pathfinding, combat, inventory races, chat floods, market contention.
- Failure injection for process death between mutation and snapshot persistence; restart tests for durable schedules/mutable world/ownership (shared with Feature 98).
- Roll-up tests for tick exceptions, WS failures, dependency timeouts, pool exhaustion, telemetry failure, redaction, metric cardinality, alert rules, fatal shutdown deadlines (Features 94/95/97).

### Staging capacity + combined soak gates
- Promote the 4,000-player result to a distributed staging gate: production Postgres, Supabase, TLS/proxy, full map/content, slow-client backpressure, periodic dirty saves, reconnect storms, mixed actions, dense hotspots; separately bounded transport-session headroom above the in-world target.
- 30-minute combined soak: hostile/pathfinding monsters, spells, runes, loot, containers, deaths, dirty snapshots, reconnect storm, 100/300/500-player hotspots, deliberately slow clients.
- Real Supabase/staging-Postgres capacity gate: auth, world entry, pool wait, 4,000 dirty saves, transaction timeouts, pool exhaustion, DB failure. Never run against production data.
- Renderer gate on native integrated-GPU low-end and native discrete-GPU clients — WSL Chromium falls back to SwiftShader, so current results are unrepresentative.

### CI pipeline + parity ledger gate
- Pin dependencies and content manifests; CI runs typecheck, lint, unit, integration, migration, build, and provenance checks with Yarn.
- Generate and verify the pinned Canary parity inventory in CI; fail when a registered definition/callback/placement/system/action is absent from the ledger, regresses to unsupported, or loses coverage.

### Launch runbook + production checklist
- Runbook: staged rollout, maintenance mode, rollback-forward migration policy, incident response, moderation escalation, security-contact procedures.
- Checklist (all currently open): TLS/WSS + origins + proxy + env validation; Supabase captcha, production auth rate limits, session expiry, ban/mute paths tested; protocol limits and visibility filters pass abuse tests; backups restore and reconciliation passes; graceful deploys reach zero unsaved characters and crash recovery passes; structured logs/dashboards/SLO alerts/telemetry monitoring/admin authorization/audit review live and exercised by an incident drill; no known race missing its regression test; the parity ledger has zero unsupported entries, unreviewed callbacks, or stale blockers.

## Implementation
- Build on `server/src/playtest/` — `LoadTestClient.ts`, `PlaytestClient.ts`, `monsterLoadServer.ts`, `playerLoadServer.ts`, `ParityRig.ts` all exist. Fuzz layer at the Session parse path; races use the two-intents-one-item pattern.
- Combined soak: extend `playerLoadServer.ts`/`monsterLoadServer.ts` into one scenario; staging infra comes from Feature 98. Renderer gate reuses `client/e2e/` on native hardware.
- CI workflow files (only `migrations.yml` exists today); parity tooling ties to Feature 1's ledger and `ParityRig.ts`.
- Runbook/checklist is documentation plus verification runs; assumes Features 93–99 are done.

## Tests
- This feature is the tests; the acceptance criterion is that every gate above exists, runs in CI or staging, and passes.

## Dependencies
- Features 93–99 (their implementations are what the roll-up suites and checklist verify).
- Feature 98 (staging environment), Feature 93 (TLS/proxy for the staging gate).
- Feature 1 (parity ledger closure — zero unsupported entries), Feature 89 (parity-gate tooling).
- Feature 101 (auth checklist items: captcha, rate limits, ban/mute verification).
