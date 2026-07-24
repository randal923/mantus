# Feature 57 — Party polish (invite shields, party-aware spells)

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

## Why
Two small Canary-parity gaps left after the party core shipped: pending invites have distinct shield colors, and party-buff/mass-heal spells must target only party members.

## Remaining work
- Invite-pending shield variants: whitish-blue (invitee) and whitish-yellow (inviter) on nameplates.
- Party-aware spell interactions (mass healing etc.) — currently blocked: no such spells exist in the catalog yet.

## Implementation
- Shield variants extend the existing party-shield projection on nameplates (`server/src/party/` projection + `client/components/party/` rendering).
- Spell interactions: when mass-healing/party-buff spells land in `server/src/combat/SpellRegistry.ts`/`SpellCaster.ts`, gate friendly-target selection on party membership re-checked at execution time inside the tick — never on the membership state at cast enqueue.

## Tests
- Pending-invite shields shown only to the involved parties per Canary visibility rules.
- Mass-heal targeting uses execution-time membership: a member who left between cast and resolution is not healed.

## Dependencies
- todo-8 spell catalog (Features 21–28) for the mass-heal/party-buff spells themselves.
