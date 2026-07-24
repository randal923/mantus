# Feature 93 — Network and resource limits

Part of [Todo 18 — Operations, observability, and security](todo-18.md).

## Why
Charter rule 10: never let one connection consume unbounded resources. A meaningful partial has already shipped — `protocol/src/limits.ts` defines `PROTOCOL_LIMITS` (`maxMessageBytes: 16_384`, `maxMessagesPerSecond: 30`); `server/src/GameServer.ts:506` sets WS `maxPayload`; `server/src/Session.ts` enforces the per-connection message rate (line 135) and outbound size (line 196); zod validation is repo-wide. The old checkboxes overstate what is missing — what remains is transport hardening, the finer-grained limits, and the process invariant.

## Remaining work

### Production transport hardening (TLS, origins, proxy)
- Deploy only behind TLS (`wss://`) with an explicit allowed-origin policy, trusted proxy configuration, secure headers, and no secrets in browser code.

### Complete connection/message limit enforcement
- Per-intent rates, aggregate connection rates, outbound queue limits (`bufferedAmount`), idle timeouts, connections per IP and per account.
- Disconnect sustained violators.
- Bound all ids, indexes, counts, paths, chat text, searches, containers, market queries, and region requests — audit every zod schema for missing `.max()` bounds.

### Single-authoritative-process-per-world invariant
- Keep one authoritative process per world; document where the deployment config lives.

## Implementation
- Origin check at WS upgrade in `server/src/GameServer.ts`; trusted-proxy/`X-Forwarded-For` handling (required for per-IP caps to be meaningful); env validation for the origin list in `server/src/config.ts`/`server/src/index.ts`. TLS termination itself is deployment config.
- Extend `protocol/src/limits.ts` with per-intent rates; enforce in `Session.ts` (which already has the rate window) plus admission-time per-IP/per-account counting in `GameServer.ts` and `SessionRegistry.ts`. Idle timeout via heartbeat tracking. Outbound queue: check `socket.bufferedAmount` before send and disconnect slow clients.
- Process invariant: documentation plus an optional startup `pg_advisory_lock` keyed by world id in `server/src/index.ts` so a second process fails fast.

## Tests
- Wrong `Origin` rejected at upgrade.
- Oversized frames, malformed payloads, and sustained violations are rejected/disconnected before touching game state.
- Per-IP/per-account caps and idle timeouts behave as configured.
- Session unit tests plus playtest abuse scenarios.

## Dependencies
- Feature 97 (startup configuration validation covers the origin list and limit values; overlaps its WS hardening work — coordinate the `Session.ts` changes).
- Feature 98 (deployment configuration home for TLS/proxy and the per-world process invariant).
