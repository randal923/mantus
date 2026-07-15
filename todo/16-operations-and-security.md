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

## Database, audit, and recovery

- [ ] Use parameterized queries, least-privilege database roles, encrypted
  connections/backups, migration locks/checksums, transaction timeouts, and
  tested connection-pool limits.
- [ ] Append economy and moderation audit events in the same transaction as the
  authoritative change. Make the audit log tamper-evident or access-restricted.
- [ ] Automate backups and regularly test restore into an isolated environment.
  Reconcile audit totals/items after restore before allowing connections.
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

## Production checklist

- [ ] TLS/WSS, allowed origins, secure proxy headers, and production environment
  validation are enabled.
- [ ] Supabase captcha, production auth rate limits, session expiry, and ban/mute
  paths are configured and tested.
- [ ] Protocol size/rate/backpressure limits and visibility filters pass abuse
  tests.
- [ ] Backups restore successfully and item/gold/audit reconciliation passes.
- [ ] Metrics, alerts, logs, admin authorization, and audit review are live.
- [ ] No known character/item/economy race is missing its regression test.

[Back to overview](README.md)
