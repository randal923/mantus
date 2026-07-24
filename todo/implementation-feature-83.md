# Feature 83 — Cyclopedia views

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
The Cyclopedia is Canary's umbrella UI for character, map, house, item, and monster information. Its danger is over-sharing: every view must be an authorized, bounded projection, never a raw game-state query.

## Remaining work
- Cyclopedia character/map/house/item/monster views.
- Achievements/titles/badges display (overlaps Feature 67's grant tables).
- Attached effects.
- Authorized tracker projections.

## Implementation
- Bounded read models per view, following the `HighscoreService` pattern in `server/src/social/` (fixed parameterized queries, row limits, no private state) — never raw game-state queries (charter rules 6 and 7).
- Client modals in `client/components/`.
- House view ties to Feature 61's auction data (bids/state for houses the viewer may see).
- Monster view builds on the shipped bestiary stage-gated projections.

## Tests
- Each view exposes only authorized data (no other players' private state; stage-gated bestiary data respected).
- Queries bounded (limits) regardless of client parameters.

## Dependencies
- Feature 67 (achievements/titles/badges data).
- Feature 61 (house auction data), houses core (shipped).
- Bestiary (shipped).
