# Feature 85 — Familiars, hirelings, and summons

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
Player-bound creatures — vocation familiars, house hirelings, and combat summons — need ownership, persistence, dialogue, combat behavior, and return rules, all server-side.

## Remaining work
- Familiars: vocation+level entitlement, persistence, combat behavior.
- Hirelings: ownership, house placement, service dialogues, skills/outfits.
- Player summons: ownership links, combat behavior, leash/return rules.

## Implementation
- Summons in the existing creature system with owner links and server-side leash/return logic (summon follows/returns based on server rules, not client commands beyond bounded intents).
- Hirelings as persistent NPC-like entities tied to houses, with service dialogues through the NPC dialogue system; placement authorized via house ownership at execution time.
- Familiars granted from vocation+level entitlement (same entitlement pattern as Features 70/71).
- Hireling services that touch the economy (goods, banking) go through the same ACID + audit paths as regular NPCs.

## Tests
- Summon ownership/leash enforced server-side; forged control intents for others' summons rejected.
- Hireling placement/removal follows house ownership at execution time (eviction removes hirelings safely).

## Dependencies
- Houses (shipped) for hirelings.
- NPC dialogue system (todo-11).
- Creature AI (todo-5).
