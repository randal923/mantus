# Server error-handling hardening

Part of [`16-operations-and-security`](16-operations-and-security.md). These
gaps were audited 2026-07-15 against the current repository.

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

## Required tests

- [ ] Tick exceptions, WebSocket emitter/send failures, dependency timeouts,
  and DB pool exhaustion follow the defined policies.
- [ ] Ambiguous commit outcomes never cause a blind retry of a non-idempotent
  economy operation.
- [ ] Fatal reporting exits within its deadline and cannot recurse or hang.

[Back to overview](README.md)
