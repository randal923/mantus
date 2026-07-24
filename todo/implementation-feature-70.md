# Feature 70 — Outfits and addons

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
Outfit rendering in public creature state exists, but there is no server-owned record of which outfits/addons a character is entitled to — a modified client could select anything.

## Remaining work
- Server-owned outfit/addon entitlement storage.
- Unlock paths (quests, achievements, store).
- Selection validation — validate the chosen outfit/addon against entitlements before projecting it into public creature state.

## Implementation
- Entitlement table (new migration) keyed by character; grants happen server-side from unlock sources.
- Selection intent (bounded zod schema in `protocol/`) validated at execution time against the entitlement table before the outfit enters the creature projection.

## Tests
- Forged outfit/addon ids rejected; unentitled selections never reach other clients' view.

## Dependencies
- Quest/achievement unlock sources (todo-21 quests, Feature 67 achievements, Feature 43 store).
- Feeds Feature 71 (mounts reuse the entitlement pattern).
