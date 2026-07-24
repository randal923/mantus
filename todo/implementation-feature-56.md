# Feature 56 — Party finder

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

## Why
Canary's party finder lets leaders advertise hunts and members search for parties. Without it, party formation is word-of-mouth only.

## Remaining work
- Leader/member finder flows: party list and search UI.
- Bounded listing read model with no over-share; visibility governed by the finder-visibility privacy rules from the friend system.

## Implementation
- New bounded intents and read models in `protocol/src/party.ts` (schema + max size + rate expectation first, per charter).
- Listing service in `server/src/party/`: bounded query results, only data a searching player is entitled to see — no full-roster or private-state dumps.
- Client UI in `client/components/party/`.
- Coordinate visibility rules with Feature 65 (friend-system finder-visibility settings) so a player who opts out is not listed.

## Tests
- Listing queries are bounded (row limits) and expose no private state (hp/mana, location beyond what finder entries include).
- Visibility settings respected at query execution time, not at enqueue.

## Dependencies
- Feature 65 (finder-visibility privacy rules).
