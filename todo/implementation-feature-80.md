# Feature 80 — Wheel rule gaps

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
The shipped wheel core deviates from Canary in a few rules and misses secondary point sources and display niceties.

## Remaining work
- Point removal is allowed anywhere; Canary restricts allocation decreases to a protection zone near a temple — enforce in `WheelService.handleSave` when the allocation shrinks.
- Extra point sources: promotion scrolls, Monk quest bonus, hunting-task points.
- `PgItemLocks` offline capacity derives without the wheel bonus (slightly conservative — offline characters get less capacity than entitled).
- Boosted (green) skill display: wheel skill boosts apply in combat but the skills panel shows base levels only.

## Implementation
- PZ-near-temple check in `server/src/wheel/WheelService.ts` (`handleSave`) at execution time when any slice decreases.
- Point sources: promotion scrolls need store/quest items; hunting-task points hook up from Feature 75.
- Include the wheel capacity bonus in `PgItemLocks` offline capacity derivation.
- Project boosted skill values in the skills-panel message and render them distinctly (green) client-side — projection only, combat math already server-side.

## Tests
- Allocation-shrinking saves outside a temple PZ rejected; additions still allowed anywhere Canary allows.
- Point-source grants are exactly-once (scroll consumption atomic with point grant).

## Dependencies
- Feature 75 (hunting tasks provide points).
- Store items (Feature 43) for promotion scrolls.
- Wheel core (shipped).
