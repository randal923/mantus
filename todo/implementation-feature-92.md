# Feature 92 — Client error handling and diagnostics

Part of [Todo 17 — Client and session resilience](todo-17.md).

## Why
Client failures today are mostly silent or unhandled: no bootstrap failure UI, no malformed-server-message policy, no typed taxonomy, no redacted reporting. Freeze diagnostics are the one completed piece — server tick and headless client are both proven clean, and the probes are retained as regression gates (see done.md).

## Remaining work

### Periodic freeze investigation (environment-specific)
- A ~20–30s periodic freeze remains in dev play. Suspects: `next dev`/HMR, browser extensions/devtools, GPU/driver vsync, the WSL2↔Windows boundary.
- Next step: run the long-task/heap observer snippet from `client/e2e/gameFreeze.e2e.test.tsx` in the real session's devtools console; correlate timestamps with HMR/GPU logs.
- Keep both existing probes (`yarn playtest:tick-stall` via `server/src/playtest/lagMonitor.mjs`; `yarn test:e2e` via `gameFreeze.e2e.test.tsx`) as regression gates.

### Client bootstrap/network/render error handling
- Bootstrap: catch dynamic import, Pixi init, asset catalog/preload, map manifest, and initial world-renderer failures — retryable/fatal UI plus exactly one bounded diagnostic.
- WebSocket: handle `error` plus close code/reason; connection/auth/entry deadlines; invalid JSON/schema messages with a bounded violation policy for malformed server traffic; distinguish retryable transport vs protocol/build mismatch vs kick vs fatal.
- HTTP: status plus runtime-schema checks for catalogs/palettes/manifests/regions; abort/timeout, capped retry with jitter, cache invalidation, visible fallback; no silent empty regions.
- Async: catch `setMap`, region draw, renderer message handling, auth-session bootstrap, logout, language init; route/component error boundaries; a safe logout/retry path from every failure state.

### Client error taxonomy + redacted diagnostics + source maps
- Typed client error taxonomy; redacted reporter carrying client build, phase, stable category, connection attempt, server correlation id.
- Never report tokens, raw messages, private character state, or unrestricted browser data.
- Upload production source maps privately; connect error groups to release metadata in the ops dashboard.

## Implementation
- Socket handling in `client/lib/net/GameClient.ts` (add a malformed-message strike policy); bootstrap handling in the game-window mount path; region/manifest fetch handling in `client/lib/render/MapView.ts` plus the asset loaders; React error boundaries at the game-window route (Next `error.tsx`).
- Taxonomy/reporter as a new module under `client/lib/`; the reporter posts to a rate-limited server endpoint (Feature 95's telemetry ingestion), correlating with Feature 94's correlation ids. Source-map upload wired into the Next build pipeline.
- The freeze item is a measurement task, not code.

## Tests
- Failures produce the intended UI plus exactly one redacted diagnostic, without unhandled rejections.
- Malformed server messages, stale build, telemetry outage, and repeated retries stay bounded and recover.
- Redaction tests for the reporter (no tokens, raw messages, private state).
- Tests live in `client/e2e/` plus store unit tests.

## Dependencies
- Feature 90 (connection state machine drives retryable-vs-fatal routing).
- Feature 94 (server correlation ids flow to the client reporter).
- Feature 95 (rate-limited telemetry ingestion endpoint receives the reporter payloads).
