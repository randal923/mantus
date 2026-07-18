# Testing, release gates, and production checklist

Part of [`16-operations-and-security`](16-operations-and-security.md). This is
the final gate before public access; it assumes 16a–16g are in place.

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
- [ ] Generate and verify the pinned Canary parity inventory in CI. Fail when a
  registered gameplay definition, callback, placement, persistent system, or
  player/operator-facing action is absent from the ledger, regresses to
  unsupported, or loses aggregate/fixture coverage.
- [ ] Fix 3 pre-existing pg integration failures (verified identical before
  and after the 2026-07-18 structural refactor, so not refactor-caused):
  `PgCharacterStore` "serializes generic container moves" and "rolls ownership
  and audit back together" both abort early with "starter gold was not
  created" (the tests expect a gold item in the starter set that the current
  starter content no longer includes), and `PgDepotStore` "delivers one
  offline reward when the same delivery is retried" surfaces "could not
  serialize access due to concurrent update" instead of retrying/absorbing
  the serialization conflict. The other 66 integration tests pass against the
  local docker Postgres.

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
