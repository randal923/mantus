# Structured logging and tracing

Part of [`17-operations-and-security`](17-operations-and-security.md).
Hardening runs alongside every feature and is required before public access.

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

## Required tests

- [ ] Field-level redaction: no credential, token, private chat, or full
  inventory payload appears in any log output.
- [ ] Logging backpressure/backend failure does not stall the game tick.

[Back to overview](README.md)
