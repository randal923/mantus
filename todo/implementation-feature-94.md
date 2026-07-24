# Feature 94 — Structured logging

Part of [Todo 18 — Operations, observability, and security](todo-18.md).

## Why
The server still uses direct `console.*` everywhere (e.g. `server/src/index.ts:49`). Without structured, redacted, centralized events there is no incident timeline, no correlation with client errors, and no safe way to log at production volume.

## Remaining work

### Structured logger + event catalog
- Versioned structured-event catalog: timestamp, severity, environment, world, build/content version, event name, outcome, duration, safe correlation id, relevant ids; stable field names and error categories.
- Replace `console.*` with one configured logger; preserve Error name/message/stack/cause; child context; fatal-record flush with a strict deadline during shutdown.

### Lifecycle/security/feature event coverage
- Lifecycle/security events: startup/config/migration, connection admission, auth category, character create/select, login/logout/reconnect/kick, persistence retry/failure/recovery, protocol strikes/rate limits, admin actions, deployments, shutdown, crashes.
- Feature-local diagnostics as systems land: movement rejection categories, deaths, progression awards, loot creation, item transfers, trades/market fills, quest transitions, world events, house rent, conservation failures.
- Diagnostic logs are not a substitute for the audit table (charter rule 11 still governs economy events).

### Redaction, volume discipline, non-blocking logging
- Never log credentials, JWTs, raw auth headers, private chat, complete inventory/quest payloads, or arbitrary inbound packets; hash/truncate network identifiers; field-level redaction tests.
- No synchronous per-tick/per-packet logging; aggregate counters plus bounded sampling on high-volume success paths; retain all errors/security/audit events.
- Logging backpressure must never stall the tick.

### Log centralization and sampled tracing
- Centralize logs: access control, encryption, retention, searchable correlation, release/source-map metadata, storage budgets; an operator can build an incident timeline without seeing other players' private state.
- Sampled traces for auth, character entry, persistence, DB transactions, content loading, admin ops; propagate correlation ids; no per-tick tracing; no network-controlled high-cardinality attributes.

## Implementation
- New `server/src/logging/` module; sweep all `console.*` call sites. Child context binds session/character ids at creation. Shutdown flush integrates with Feature 98's drain machinery.
- pino is the obvious logger candidate but is a **new dependency — ask before adding**, per repo rules.
- Instrument `AuthHandler.ts`, `CharacterHandler.ts`, `Session.ts` (protocol strikes are currently silent), `MovementHandler.ts`, combat/loot/market/trade paths, and `ModerationService.ts`.
- Redaction implemented as serializers in the logging module.
- Centralization is an infra choice; correlation-id propagation flows AuthHandler → CharacterHandler → persistence, and the correlation id also flows to the client for Feature 92's reporter.

## Tests
- Field-level redaction tests (credentials/JWTs/chat/inventory never serialized).
- Backpressure test: `lagMonitor.mjs` tick-stall probe with an injected slow sink — the tick must not stall.
- Error name/message/stack/cause preserved through serialization.
- Fatal flush respects its deadline.

## Dependencies
- Feature 98 (drain/shutdown machinery for the fatal flush; centralization infra).
- Feeds Feature 92 (correlation ids), Feature 95 (dashboards join logs↔metrics), Feature 97 (structured fatal events).
