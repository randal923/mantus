# Feature 57 — Party polish (party-aware spells)

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

Invite-pending shields shipped 2026-07-25 — see the
[completed log](completed/implementation-feature-57-completed.md).

## Remaining work

- **Party-aware spell interactions (mass healing etc.).** Still blocked: no
  mass-heal or party-buff spell exists in the imported catalog, so there is
  nothing to gate. When they land in
  `server/src/combat/SpellRegistry.ts`/`SpellCaster.ts`, friendly-target
  selection must be gated on party membership re-checked at execution time
  inside the tick — never on the membership state at cast enqueue.

## Tests

- Pending-invite shields shown only to the involved parties — **done**.
- Mass-heal targeting uses execution-time membership: a member who left between
  cast and resolution is not healed — pending the spells.

## Dependencies

- todo-8 spell catalog (Features 21–28) for the mass-heal/party-buff spells.
