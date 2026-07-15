# Client and session resilience

Build this continuously as authoritative features land. Reconnect and resync
must restore server truth without replaying stale intents or duplicating state.

## Protocol revisions and resync

- [ ] Give the selected session/world stream an id and monotonic authoritative
  revision or sequence. Ignore events from superseded connections/sessions.
- [ ] Add bounded full-own-state and visible-world snapshot messages plus
  revisioned deltas. Define when the client requests/requires a resync.
- [ ] On a revision gap, stop applying dependent deltas and request/reconnect;
  never guess item ownership, combat state, or position.
- [ ] Use idempotency keys only where retryable durable operations require them;
  ordinary real-time movement/combat intents should not be blindly replayed.

## Reconnect behavior

- [ ] Implement explicit connecting, authenticated, character-select, entering,
  online, reconnecting, kicked, and fatal states instead of loose booleans.
- [ ] Apply capped exponential reconnect delay with jitter, cancellation, and a
  clear user status. Do not start duplicate sockets/tickers/listeners.
- [ ] On reconnect, re-authenticate and re-select/claim the character under the
  one-session rule, then rebuild from an authoritative snapshot.
- [ ] Clear pending movement prediction, drag/drop reservations, target/cooldown
  decoration, open private containers, and transient effects unless the new
  snapshot explicitly restores them.
- [ ] Handle token expiry/refresh without logging tokens or exposing them in
  error messages.

## Client state boundaries

- [ ] Keep server entities keyed by stable ids/revisions; do not let Pixi display
  objects become the source of gameplay state.
- [ ] Separate connection/domain state from rendering and React panels. Derive
  views without effect-driven copies where possible.
- [ ] Bound map-region, message, effect, battle-list, and container caches and
  dispose Pixi resources/listeners deterministically.
- [ ] Surface rejected intents and authoritative corrections without leaking
  server internals.

## Required tests

- [ ] Disconnect during movement, floor change, item transfer, combat, death,
  trade, and travel converges to the committed server state.
- [ ] Late packets from an old socket/session cannot mutate the new client state.
- [ ] Duplicate/out-of-order deltas trigger ignore/resync behavior as designed.
- [ ] Reconnect does not duplicate socket handlers, tickers, sprites, or intents.
- [ ] Cache/resource counts stay bounded through repeated region/floor changes.

[Back to overview](README.md)
