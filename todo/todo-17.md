# Todo 17 — Client and session resilience

Almost nothing in this area has shipped. The only completed work is freeze diagnostics: the server tick and the headless client are both proven clean, and the probes (`yarn playtest:tick-stall`, `client/e2e/gameFreeze.e2e.test.tsx`) are retained as regression gates (see [done](done.md)). The client still has only a loose `status: "connecting"` string and a bare `reconnect(characterId)` action in `createGameWindowStore.ts` — no revisioned stream protocol, no connection state machine, no bounded caches, no error taxonomy. Ordering: Feature 90 first — its revisioned stream and state machine are prerequisites for Feature 92's network error handling; Feature 92 also depends on todo-18's correlation ids (Feature 94) and telemetry ingestion (Feature 95), so its taxonomy/reporter half should land alongside those.

## Remaining features

- [ ] **Feature 90 — Session resync and reconnect** — Revisioned world stream with snapshot/resync protocol, an explicit client connection state machine with capped-backoff reconnect, and a disconnect-during-X regression suite. See [implementation](implementation-feature-90.md).
- [ ] **Feature 91 — Client state boundaries and bounded resources** — Separate server-authoritative domain state from rendering/React state, bound every client cache, and dispose Pixi resources deterministically. See [implementation](implementation-feature-91.md).
- [ ] **Feature 92 — Client error handling and diagnostics** — Environment-specific freeze investigation, bootstrap/network/render failure handling with retryable-vs-fatal UI, and a typed error taxonomy with redacted reporting and production source maps. See [implementation](implementation-feature-92.md).

[Back to overview](README.md)
