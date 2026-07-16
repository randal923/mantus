# Network and resource limits

Part of [`16-operations-and-security`](16-operations-and-security.md).
Hardening runs alongside every feature and is required before public access.

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

## Required tests

- [ ] Oversized frames, malformed payloads, and sustained rate violations are
  rejected/disconnected before touching game state.
- [ ] Per-IP/account connection caps and idle timeouts behave as specified.

[Back to overview](README.md)
