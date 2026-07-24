# Feature 90 — Session resync and reconnect

Part of [Todo 17 — Client and session resilience](todo-17.md).

## Why
Reconnect/resync must restore server truth without replaying stale intents or duplicating state. Today the client has only a loose `status: "connecting"` string and a bare `reconnect(characterId)` action (~line 374 of `createGameWindowStore.ts`) — no backoff, no state machine, no snapshot/revision protocol, so any drop risks divergent or duplicated client state.

## Remaining work

### Revisioned world stream + snapshot/resync protocol
- Session/world-stream id plus a monotonic revision/sequence on server messages; client ignores events from superseded connections.
- Bounded full-own-state and visible-world snapshot messages plus revisioned deltas; define exactly when the client requests/requires a resync.
- On a revision gap: stop applying dependent deltas and request resync/reconnect; never guess item ownership, combat state, or position.
- Idempotency keys only where retryable durable operations need them; real-time movement/combat intents must not be blindly replayed.

### Explicit client connection state machine + reconnect flow
- Explicit connecting/authenticated/character-select/entering/online/reconnecting/kicked/fatal states replacing the loose booleans/strings.
- Capped exponential reconnect delay with jitter, cancellation, and clear user-facing status; no duplicate sockets, tickers, or listeners.
- On reconnect: re-authenticate, re-claim the character under the one-session rule, rebuild from the authoritative snapshot.
- Clear pending movement prediction, drag/drop reservations, target/cooldown decoration, open private containers, and transient effects unless the snapshot restores them.
- Token expiry/refresh handling without ever logging tokens.

### Resync/reconnect regression test suite
- Disconnect-during-X matrix (movement, floor change, item transfer, combat, death, trade, travel) — each converges to the committed server state.
- Late packets from the old socket cannot mutate new client state.
- Duplicate/out-of-order deltas trigger ignore/resync.
- Reconnect does not duplicate handlers, tickers, sprites, or intents.

## Implementation
- Protocol first (charter: schema + max size + rate expectation before the handler): add revision/stream-id fields to server messages in `protocol/src/serverMessages.ts`.
- Server: stamp outbound messages in `server/src/Session.ts` (owns the socket send path) and `server/src/GameServer.ts`; extend the welcome payload into an explicit, requestable resync message.
- Client: `client/lib/net/GameClient.ts` tracks last-applied revision and gates delta application; `client/components/game-window/store/createGameWindowStore.ts` holds the domain state to rebuild. Refactor its status into a typed union; put backoff/jitter in `GameClient.ts` or a sibling connection-manager file.
- The optimistic drag queue and movement prediction need a `clearTransient()` path invoked on reconnect. Auth refresh goes through the existing Supabase JWT flow.
- Internal ordering: the revisioned stream/snapshot protocol lands first; the state machine depends on it; the regression suite covers both.

## Tests
- Duplicate and out-of-order delta handling (ignore or resync, never partial apply).
- Late packets from a superseded socket are rejected.
- Reconnect does not duplicate handlers/tickers/sprites/intents (client handler/ticker-leak assertions in `client/e2e/` — harness exists: `client/e2e/gameFreeze.e2e.test.tsx`).
- Disconnect during movement/floor change/item transfer/combat/death/trade/travel converges — extend `server/src/playtest/` scenarios using the `PlaytestClient.ts` `banker-relogin` pattern.

## Dependencies
- None external; Features 91 and 92 build on the state machine and resync semantics defined here.
- Server one-session-per-character rule (already live) is re-exercised by the reconnect flow.
