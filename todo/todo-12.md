# Todo 12 — Operations, security, auth, and dev tooling

**Features 93–102, 106.** Shipped: `PROTOCOL_LIMITS` size/rate enforcement,
the moderation suite with same-transaction audits, in-transaction economy
audit rows, two (explicitly insufficient) load baselines, and Feature 96's
core — the `accounts.role` migration (054), fail-closed capabilities,
per-command gating, audited `/goto`/`/bring`/`/inspect` (see
[done.md](done.md)). Everything else is not started: the server logs via
`console.*`, no metrics, no drain path, no typed errors, no backup
automation. Order: Feature 96's residue first — small, converging, unblocks
43/54/101/102 (README step 3); then 93 and 97, which protect the live game;
100 is the final pre-launch gate and assumes 93–99 plus Feature 1's ledger
closure.

## Feature 93 — Network and resource limits

Charter rule 10. Already live: `maxMessageBytes: 16_384`,
`maxMessagesPerSecond: 30` (`protocol/src/limits.ts`), WS `maxPayload`
(`GameServer.ts`), per-connection rate + outbound size (`Session.ts`),
zod validation repo-wide.

**Remaining work**

- *Transport hardening:* deploy only behind TLS (`wss://`) with an explicit
  allowed-origin policy, trusted proxy configuration, secure headers, no
  secrets in browser code.
- *Finer-grained limits:* per-intent rates, aggregate connection rates,
  outbound queue limits (`bufferedAmount`), idle timeouts, connections per
  IP and per account; disconnect sustained violators; audit every zod schema
  for missing `.max()` bounds (ids, indexes, counts, paths, chat text,
  searches, containers, market queries, region requests).
- *Single-authoritative-process-per-world invariant* — document where the
  deployment config lives; optional startup `pg_advisory_lock` keyed by
  world id so a second process fails fast.

**Implementation:** origin check at WS upgrade in `GameServer.ts`;
trusted-proxy/`X-Forwarded-For` handling (prerequisite for meaningful
per-IP caps); env validation for the origin list in `config.ts`/`index.ts`;
per-intent rates in `protocol/src/limits.ts` enforced in `Session.ts`;
admission-time per-IP/per-account counting in `GameServer.ts` +
`SessionRegistry.ts`; idle timeout via heartbeat; check
`socket.bufferedAmount` before send. Coordinates with Feature 97's WS work.

**Tests:** wrong `Origin` rejected at upgrade; oversized/malformed/sustained
violations rejected before touching game state; per-IP/per-account caps and
idle timeouts behave as configured.

## Feature 94 — Structured logging

The server logs via `console.*` (e.g. `index.ts:49`) — no incident timeline,
no correlation, no production-safe volume.

**Remaining work:** versioned structured-event catalog (timestamp, severity,
environment, world, build/content version, event name, outcome, duration,
correlation id, relevant ids); one configured logger replacing `console.*`
(preserve name/message/stack/cause; child context; fatal flush with a strict
shutdown deadline); lifecycle/security coverage (startup/config/migration,
admission, auth category, character flows, persistence retry/failure,
protocol strikes — currently silent — rate limits, admin actions, deploys,
crashes) and feature-local diagnostics as systems land; redaction (never
credentials, JWTs, raw auth headers, private chat, full inventory/quest
payloads; hash/truncate network identifiers) with field-level tests; volume
discipline (no synchronous per-tick/per-packet logging; aggregate counters +
bounded sampling; backpressure never stalls the tick); centralization with
access control/retention/correlation and sampled tracing (auth, entry,
persistence, DB transactions, content loading, admin ops — no per-tick
tracing).

**Implementation:** new `server/src/logging/` module; sweep `console.*`
call sites; instrument `AuthHandler.ts`, `CharacterHandler.ts`,
`Session.ts`, `MovementHandler.ts`, combat/loot/market/trade paths,
`ModerationService.ts`. pino is the obvious candidate but is a **new
dependency — ask first**. Correlation ids flow to Feature 92's client
reporter. Audit table stays governed by charter rule 11 — logs are not a
substitute.

**Tests:** field-level redaction; backpressure via the `lagMonitor.mjs`
tick-stall probe with an injected slow sink; Error fields preserved through
serialization; fatal flush respects its deadline.

## Feature 95 — Metrics and alerting

Nothing exists: no export, dashboards, alerts, health endpoints, or client
telemetry — every other hardening feature is unverifiable without this.

**Remaining work:** runtime metrics (CPU/RSS/heap/GC/event-loop lag, tick
duration/overruns/backlog, session counts, admission/disconnect reasons,
inbound violation rates, outbound queue bytes); persistence metrics (pool
states, query/transaction latency, retries, conflicts, dirty/pending/failed
saves, oldest-unsaved age, flush duration); gameplay metrics (population
bands, movement accept/reject, spawn/AI budgets, combat/death rates,
gold/item sources and sinks, market volume, reconciliation drift);
cardinality discipline (no entity ids in labels); dashboards + SLO alerts
(tick overruns, crash loops, pool exhaustion, unsaved-state age, economy
drift, reconnect storms, missing telemetry); client telemetry ingestion
(rate-limited zod-validated endpoint receiving Feature 92's reporter — never
tokens or private projections); pipeline self-monitoring; separate
liveness/readiness/metrics endpoints (readiness includes tick health,
dependencies, drain state, unsafe save backlog; not public, not sharing
gameplay auth).

**Implementation:** new `server/src/metrics/` module instrumenting
`TickLoop.ts`, `GameServer.ts`/`Session.ts`, the pg pool, and the
character-save path (dirty-flag saves are the hook). prom-client is the
obvious exporter — **new dependency, ask first**. Dashboards/alert rules
versioned in-repo; health endpoints on an internal port in `index.ts`.

**Tests:** label-cardinality assertion; exporter failure does not affect the
game; telemetry endpoint rejects unvalidated/oversized/over-rate payloads;
cross-world isolation on dashboard access.

## Feature 96 — Role-authorized admin tooling (remainder)

Core shipped: `server/src/auth/AccountRole.ts` capabilities,
`ModerationCommandHandler` per-command gating, `AdminCommandHandler`
(`/goto`, `/bring`, `/inspect`), `moderation_actions` with
`teleport`/`inspect` + `detail` jsonb, `is_staff` generated from the role,
and the role-authorization test suites.

**Remaining work**

- **Operator tooling to assign a role** — `accounts.role` is still set with
  direct SQL; the last piece of "never hand-edit production data as routine
  administration" (also closes the staff-flag residual).
- **Move the content/event controls off `DEV_COMMANDS`** — `/raid`,
  `/coins`, `/storerefund` need capabilities (`world.content`,
  `economy.grant`) and handlers on the production surface (owners: Features
  43 in todo-8, 54 in todo-2).
- **Conservation-report inspect surface** (absorbed from Feature 44) —
  `CurrencyConservationRunner.report` holds the last sweep; a read-only
  `/conservation` admin command is enough. Don't invent a second reporting
  channel.

**Tests:** correct role per command; forged/unauthorized admin intents
rejected and reported; targets validated at execution; complete audit record
in the same transaction.

## Feature 97 — Server error handling

Gaps audited 2026-07-15, nothing landed since: a tick exception escapes the
interval callback, protocol strikes and rate-limit disconnects are silent,
no typed categories, no dependency deadlines, no defined behavior for
ambiguous DB commits. Land early — this protects the live game.

**Remaining work**

- *Tick/process fatal policy:* record failing phase/tick, stop accepting
  work, terminate for supervisor restart — never keep ticking or blindly
  persist mid-tick state; deliberate `unhandledRejection`/
  `uncaughtException` handling (bounded cleanup then exit; fatal reporting
  must not recurse or hang).
- *WS hardening + silent-failure visibility:* server and per-socket `error`
  events, close codes, send-callback failures, serialization failures,
  `bufferedAmount` caps; disconnect cleanup through the tick queue; report
  strikes/rate-limit disconnects/full queues/heartbeat timeouts via counters
  + sampled logs.
- *Typed categories + deadlines/retry discipline:* validation,
  authorization, conflict, dependency-unavailable, timeout, retry-exhausted,
  invariant-violation, fatal-corruption-risk; auth/DB outages never
  misclassified as bad credentials; deadlines around token verification, DB
  acquire/query/transaction, shutdown flushes; **owns the economy
  connection-transient retry decision** (from Feature 47): connection loss
  during COMMIT = unknown outcome — verify via an `audit_log` idempotency
  key before any retry; never blindly retry a non-idempotent economy op.
- *Recoverable save-failure handling:* export queue depth/oldest age/cause,
  fail health checks, retain the latest dirty snapshot, tested retry/reload
  or controlled-disconnect path.
- *Startup validation:* every env/config value and required content checked
  at startup (extend `index.ts`'s existing `PG_POOL_MAX` pattern), plus a
  migration-version/content-manifest check before opening the listener —
  fail with one structured fatal event, never a partially initialized world.

**Tests:** tick-exception latch flips and admission stops; rejection paths
exit bounded; WS failures produce stable categories and tick-queued cleanup;
outage ≠ bad credentials; ambiguous-commit verification before retry;
save-failure path; startup fails fast with one structured fatal event.

## Feature 98 — Durability and deployment

**Remaining work:** documented durability window per state class (bounded
async snapshots for non-economy character state; committed-before-ack for
economy/ownership — mostly existing architecture, needs the doc + the
oldest-unsaved-age metric + kill-tests); ordered graceful drain (stop new
sessions → stop gameplay work → flush dirty snapshots with deadline →
unsaved-characters reaches zero → close → stop); cold-start reconstruction
from Postgres + versioned static content with no clean prior shutdown;
online/backward-compatible migrations by default (maintenance window only
for genuinely incompatible changes — **owns the map-version seed
reconciliation note** from Feature 15: a map/content version upgrade needs a
deliberate migration step re-running `db:reconcile-world-seed` against the
new seed).

**Implementation:** drain state machine in `index.ts`/`GameServer.ts`
(admission refusal flag, TickLoop wind-down, deadline flush); drain state
feeds Feature 95 readiness; failure-injection and boot-twice restart tests
via `server/src/playtest/` against the docker `playtest` Postgres.

**Tests:** abrupt death between mutation and snapshot loses at most the
documented window, never economy state; drain reaches zero unsaved
characters; durable schedules/world state/ownership rebuild with no clean
shutdown.

## Feature 99 — Database audit and recovery

**Remaining work:** least-privilege DB roles, encrypted
connections/backups, transaction timeouts, tested pool limits;
tamper-evident audit log (revoke UPDATE/DELETE from the game role);
`audit_log` range partitioning + archival to cold storage (never plain
deletion — it is the anti-dupe reconciliation source; hot-path inserts stay
cheap; **note:** the event-type check constraint is drop-and-recreated by
migrations 012/013/016/018/030 — the partitioning migration must preserve
that pattern); automated WAL archiving/PITR independent of the game server;
restore drills into an isolated environment with reconciliation before
connections (charter rule 12); conservation/reconciliation jobs (item
uniqueness, owner-location validity, gold/escrow totals, market fills, rare
serials — reuse `CurrencyConservationRunner`'s shape; extend to a rare-item
watchlist when one exists, and add a fourth invariant if escrow ever stops
being `remaining_amount × unit_price`).

**Tests:** restore + reconciliation pass before connections; jobs detect
injected violations (duplicate item, negative balance, orphaned escrow);
pool limits and timeouts behave as configured.

## Feature 100 — Testing and release gates

The final pre-launch gate. Existing: two prose baselines (4,000-player
protocol capacity; 1,900-monster hotspot) — both explicitly insufficient
(never combined, never production-like); CI has only `migrations.yml`.

**Remaining work:** adversarial + deterministic suites (protocol fuzz,
replay/race, slow-client backpressure, auth integration, importer fixtures,
deterministic tick simulations, failure injection shared with Feature 98,
roll-up tests for Features 94/95/97 behaviors); staging capacity + combined
soak gates (distributed staging with production Postgres/Supabase/TLS, full
map, reconnect storms, mixed actions, dense hotspots; 30-minute combined
soak; renderer gate on native low-end and discrete GPUs — WSL Chromium falls
back to SwiftShader); CI pipeline (typecheck, lint, unit, integration,
migration, build, provenance, and the parity-ledger verification failing on
any unsupported/regressed entry); launch runbook + production checklist
(staged rollout, maintenance mode, rollback-forward migration policy,
incident response, moderation escalation; TLS/origins/proxy, captcha,
production auth rate limits, ban/mute verified, backups restored and
reconciled, drains reach zero unsaved, dashboards/alerts exercised by an
incident drill, no known race missing its regression test, ledger at zero).

**Implementation:** build on `server/src/playtest/` (`LoadTestClient.ts`,
`PlaytestClient.ts`, `monsterLoadServer.ts`, `playerLoadServer.ts`,
`ParityRig.ts` all exist); fuzz at the Session parse path; staging infra
from Feature 98; parity tooling from Feature 1/89.

## Feature 101 — Auth follow-ups closure

**Remaining work:** verify/refresh the stale instant-ban checkboxes against
the shipped role gating (banned-account-cannot-reconnect coverage);
production-grade Mantus Coin funding (payment provider — with Feature 43);
the pre-public residual-risk checklist — bearer-token replay (WSS/TLS,
short-lived tokens, one-session rule, never log tokens), XSS token theft
(React escaping, no user strings in `dangerouslySetInnerHTML`, strict CSP,
small dependency surface), verify the free-form join-name path is removed,
Supabase captcha + production auth rate limits before going public, identity
always derived from the verified token (audit across `AuthHandler.ts`,
`CharacterHandler.ts`, `SessionRegistry.ts`), connect the preview
change-email/password forms to supported Supabase reauth flows.

**Tests:** old and refreshed sessions cannot both control a character; auth
failures/logs contain no bearer token or password; origin/connection/
token-expiry/account rate limits behave per production policy; banned
account cannot reconnect; coin grant writes ledger + audit atomically.

## Feature 102 — Dev tooling gaps

**Remaining work:** slotless-creature AI detach (**production-relevant** —
GM-spawned monsters and regular summons share the path; brains stay
registered until death; fix in `server/src/ai/` detach logic); dev de-level
for `/level` (dev-gated negative-exp path); `character-deleted` audit event
for `yarn character:delete` — the destroyed bank balance is only printed to
console today (charter rule 11 violation in a dev tool; new migration
following the drop-and-recreate constraint pattern, event appended inside
the deletion transaction); `gm-response` client rendering →
[client backlog](client/feature-102-gm-console.md).

**Tests:** a slotless summon's brain detaches when no player is near;
deletion writes `character-deleted` (with the bank balance) in the deletion
transaction.

## Feature 106 — Server performance deferred items (measure first)

Implement only when load data (Feature 100's staging gates) shows they
matter:

- `PG_POOL_MAX` default (20) may be low — raise to 30–40 once player counts
  and the Postgres `max_connections` budget are known (`index.ts` lines
  34–49).
- `MonsterBrain.acquireTarget` sorts all candidates with `localeCompare`
  tiebreaks and re-checks `world.canSee` per candidate — short-circuit cheap
  predicates, single-pass min. Behavior-sensitive: write a parity test
  against the current picker first (`MonsterBrain.test.ts` scaffold exists).
- Character creation runs per-item/per-skill INSERT loops
  (`insertStarterSet.ts`, `insertCharacterSkills.ts`) — batch with `unnest`
  only if creation latency matters.
- `ChatHandler.findOnlinePlayerByName` linear-scans with `toLowerCase` —
  index by normalized name only if PM volume grows.
- `ConditionManager.tick` clones per advancing tick; `project` re-sorts per
  fight-state send — low priority.
- permessage-deflate is off — enable with a ~1–2 KB threshold only if
  bandwidth matters; measure CPU first (ws options in `GameServer.ts`).

[Back to overview](README.md)
