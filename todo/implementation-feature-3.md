# Feature 3 — pz-lock enforcement on ladder/hole/rope/levitate transitions

Part of [Todo 3 — Map and movement](todo-3.md).

## Why
Security/parity bug: a pz-locked player can enter a protection zone via a ladder/hole/rope-spot transition because the use path skips the pz-lock destination check that normal walking enforces (charter rule 8: every limit the walk path enforces must hold on every path).

## Remaining work
- Add the `conditions.has("pz-lock")` + destination `protectionZone` rejection to the ladder/sewer use path.
- Give `tryLevitate` the same guard — it also lacks the check.

## Implementation
VERIFIED STILL OPEN. In `server/src/world/MovementRules.ts`, the only pz-lock check is at line 254 inside `tryMoveInternal`. The shared `tryUseAction` (lines 150-210, backing `tryUseMap` at line 84 and `tryUseRopeSpot` at line 89) validates chebyshev distance, cooldown, action activation, destination walkability, house block, occupancy, and ground speed — but never pz-lock against a protection-zone destination. Add the check in `tryUseAction` so both use paths are covered; `tryLevitate` (line 98) gets the same guard. All checks stay at execution time inside the tick, matching the existing MovementRules pattern.

## Tests
- Regression test next to existing MovementRules tests: a pz-locked player using a ladder whose destination is a protection zone must be rejected.
- Same assertion for rope spot and levitate paths.

## Dependencies
- None; small self-contained fix.
