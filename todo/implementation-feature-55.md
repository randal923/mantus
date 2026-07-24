# Feature 55 — Party analyzer

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

## Why
Hunt parties need per-member loot, supplies, damage, and healing totals over a session to split profit fairly. Canary provides this as the party analyzer; ours must be server-computed so totals cannot be forged.

## Remaining work
- Per-member loot, supplies, damage, and healing aggregation over a hunt session.
- Leader-controlled session reset and price mode.
- Bounded projection of per-member totals, visible only to current members.

## Implementation
- New `server/src/party/PartyAnalyzer.ts`, aggregating server-side from combat damage/heal events and loot pickups — the hook points already exist in `server/src/party/PartyHooks.ts`.
- Projection alongside `server/src/party/getPartyMemberProjection.ts`: bounded per-member totals, sent only to current members (charter rule 6 — no over-share).
- zod message(s) in `protocol/src/party.ts` (with size/rate expectations) before the handler; leader-only reset/price-mode intents with leadership re-checked at execution time.
- Client panel in `client/components/party/`.
- Totals derive exclusively from server-computed events — never from client-reported numbers.

## Tests
- Analyzer data is not leaked to non-members, and stops flowing after a member leaves.
- Totals come only from server-computed damage/heal/loot events; client cannot inject values.
- Reset/price-mode intents from non-leaders rejected at execution time.

## Dependencies
- Combat damage/heal event stream (todo-7/todo-8 combat systems).
- Loot pickup events (todo-9, Feature 30).
