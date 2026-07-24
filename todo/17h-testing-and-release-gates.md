# Testing, release gates, and production checklist

Part of [`17-operations-and-security`](17-operations-and-security.md). This is
the final gate before public access; it assumes 17a–17g are in place.

## Testing and release gates

- [ ] Add malformed/fuzz protocol tests, replay/race tests, slow-client/backpressure
  tests, auth/authorization integration tests, and content importer fixtures.
- [ ] Add deterministic tick simulations and load tests for player movement,
  dense visibility, animated client regions, spawns, AI/pathfinding, combat,
  inventory races, chat floods, and market contention.
- [ ] Promote the current 4,000-player controlled protocol capacity result to a
  distributed staging gate using production PostgreSQL, Supabase, TLS/proxy
  termination, the full map/content, slow-client backpressure, periodic dirty
  saves, reconnect storms, mixed actions, and dense hotspots. Keep a separately
  bounded transport-session headroom above the configured in-world target so a
  full world can still admit replacements and operators.
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
- [ ] Generate and verify the pinned Canary parity inventory in CI. Fail when a
  registered gameplay definition, callback, placement, persistent system, or
  player/operator-facing action is absent from the ledger, regresses to
  unsupported, or loses aggregate/fixture coverage.
- [ ] Add a 30-minute combined staging soak with hostile/pathfinding monsters,
  spells, runes, loot, containers, deaths, dirty character snapshots, a
  reconnect storm, 100/300/500-player dense hotspots, and deliberately slow
  clients. The current isolated gates cover 4,000 lightweight protocol players
  and 1,900 active hotspot monsters, but not both workloads together.
- [ ] Add a real Supabase/staging PostgreSQL capacity gate for authentication,
  world entry, pool wait, 4,000 dirty saves, transaction timeouts, pool
  exhaustion, and database failure. Never run this against production data.
- [ ] Run the renderer gate on a native integrated-GPU low-end client and a
  native discrete-GPU client. WSL currently exposes the RTX device to CUDA but
  Chromium falls back to SwiftShader/Canvas2D.

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
- [ ] [`00a-canary-parity`](00a-canary-parity.md) has zero unsupported
  registered gameplay entries, zero unreviewed callbacks/ignored gameplay
  fields, and no stale dependency blockers.

[Back to overview](README.md)
