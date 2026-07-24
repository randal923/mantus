# Feature 73 — Charm spending

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
Bestiary charm points are earned and displayed but unspendable, and promotion-granted minor charm echoes persist with no rune-spending UI/service. Charms are a real combat system in Canary.

## Remaining work
- Charm rune spending: table, spend intents, UI (charm points currently earn-only).
- Promotion-granted minor charm echoes: persist already, need the spending/assignment surface.
- Combat application of charm effects (procs).

## Implementation
- Extend `server/src/bestiary/` (points live in `BestiaryTracker.ts`) with a charm table + spend/assign intents (bounded zod schemas first).
- Charm procs rolled in `server/src/combat/Combat.ts`/`DamageResolver` with server RNG at damage execution time — never client-rolled (charter combat rule).
- Point balances re-checked at spend execution inside the tick.

## Tests
- Spend races cannot double-spend charm points.
- Procs are server-rolled; client cannot trigger or influence them.

## Dependencies
- Bestiary core (shipped).
- Combat damage hooks (todo-7/8).
