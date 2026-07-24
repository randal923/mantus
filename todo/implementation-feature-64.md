# Feature 64 — House polish (rent letters, mob blocking, eviction edges)

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

## Why
The house core is exploit-tested, but a few Canary behaviors and two accepted limitations remain: rent warnings are plain server messages, monsters/NPCs can wander into houses, and eviction has known edge cases.

## Remaining work
- Rent-warning letter items (currently server messages only).
- Blocking monsters/NPCs from entering house tiles.
- Eviction reconciliation for in-flight world-item persists (accepted limitation — memory-first world-item persistence means an item's tile persist may still be in flight when the eviction sweep runs).
- Inbox-overflow spillover: surplus evicted items currently stay on tiles, audited (accepted limitation) — decide Canary behavior vs. keep-and-audit.

## Implementation
- Rent letters delivered to depot/inbox via the existing per-item idempotent delivery-key path (same mechanism as eviction delivery), so crash/replay cannot duplicate letters.
- Mob blocking: house-tile check in monster/NPC pathing in `server/src/world/MovementRules.ts` using the house-tile index already built on `MapData`/`World`.
- Eviction sweep must account for items whose world-tile persist is in flight before moving/counting them (coordinate with the memory-first world-item persistence invariant).
- Inbox overflow: research pinned Canary behavior; either implement it exactly or keep the audited-spillover behavior and record the deviation.

## Tests
- Rent letters exactly-once across restart (delivery-key replay test).
- Monster/NPC paths never enter house tiles.
- Eviction during an in-flight world-item persist conserves every item.

## Dependencies
- Economy/depot core (todo-12, shipped pieces).
- World-item persistence (memory-first corpse/world-item invariants, Feature 31 area).
