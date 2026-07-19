# Client error handling and diagnostics

Part of [`16-client-resilience`](16-client-resilience.md). Build continuously
as authoritative features land.

## Error handling and diagnostics

- [ ] Catch dynamic import, Pixi initialization, asset catalog/preload, map
  manifest, and initial world-renderer failures in the game bootstrap. Show a
  retryable or fatal UI state and emit one bounded diagnostic instead of
  leaving an unhandled promise rejection or permanent loading screen.
- [ ] Handle WebSocket `error` plus close code/reason, connection/auth/entry
  deadlines, and invalid JSON/schema messages. Apply a bounded violation policy
  for malformed server traffic and distinguish retryable transport failure,
  protocol/build mismatch, kick, and fatal client state.
- [ ] Check HTTP status and runtime schema for asset catalogs, palettes,
  manifests, and regions. Add abort/timeout, capped retry with jitter, cache
  invalidation, and visible fallback behavior; do not silently turn every map
  failure into an empty region.
- [ ] Catch asynchronous `setMap`, region draw, renderer message, auth-session
  bootstrap, logout, and language initialization failures. Add route/component
  error boundaries for unexpected render errors and preserve a safe way to
  logout or retry.
- [ ] Add a small typed client error taxonomy and redacted diagnostic reporter
  carrying client build, phase, stable error category, connection attempt, and
  correlation id where provided by the server. Never attach tokens, raw
  messages, private character state, or unrestricted browser data.
- [ ] Upload matching production source maps privately and connect client error
  groups to release/build metadata in the operations dashboard.

## Required tests

- [ ] Initialization/fetch/socket/render failures produce the intended UI and
  one redacted diagnostic without an unhandled rejection.
- [ ] Malformed server messages, stale build/protocol mismatches, telemetry
  outages, and repeated retry failures remain bounded and recover safely.

[Back to overview](README.md)
