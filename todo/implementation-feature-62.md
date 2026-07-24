# Feature 62 — House access lists (Canary syntax, per-door)

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

## Why
Canary house access is controlled by text access lists supporting `@guild`/rank entries and wildcards, plus separate per-door lists (list kind = 2). Our shipped guest/subowner model covers only direct invitations.

## Remaining work
- Canary text access-list syntax: `@guild` and rank entries, wildcards.
- Separate per-door access lists (kind=2), distinct from the house-wide list.

## Implementation
- Parser as a pure util in `server/src/house/` (one exported function per file, per code standards).
- Lists stored per-house and per-door in the house store (`PgHouseStore.ts` + migration).
- Evaluation at execution time inside `HouseService.canUseHouseTile` and door use — `@guild` entries resolve against live guild membership at check time, never a cached snapshot.
- Bounded zod schema for list-edit intents: max list size and entry length, so malformed/oversized lists are rejected before parsing (charter rules 1 and 10).

## Tests
- Stale guild membership cannot retain access: leaving the guild blocks the next door use/step.
- Malformed and oversized lists rejected by the bounded schema.
- Per-door list is enforced independently of the house-wide list.

## Dependencies
- Guilds (shipped, old todo 14b core).
