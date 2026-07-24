# Feature 76 — Boosted creatures/bosses and kill trackers

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
Canary picks a daily boosted creature and boss with exp/loot modifiers, and shows client kill trackers and boss slots. Selection and modifiers must be server-side or they become free multipliers.

## Remaining work
- Daily boosted creature/boss selection with exp/loot modifiers.
- Client kill trackers.
- Boss slots / boss loot bonus.

## Implementation
- Server-selected daily boost using server RNG, announced to clients via a projection (never client-selectable).
- Modifiers applied in the kill-reward and loot-roll paths at execution time.
- Daily rotation scheduled through the Feature 54 world-event scheduling engine.
- Tracker projections bounded per character (own kills only — charter rule 6).

## Tests
- Boost modifiers apply only to the server-selected race/boss on the current day.
- Tracker projections expose only the requesting character's own counts.

## Dependencies
- Bestiary/bosstiary core (shipped).
- Feature 54 (world-event scheduling for the daily rotation).
