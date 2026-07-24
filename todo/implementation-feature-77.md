# Feature 77 — Bestiary accepted-limitation fixes

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
Three accepted limitations were recorded when the bestiary core shipped; they are Canary deviations or UX papercuts worth closing.

## Remaining work
- Kill credit currently = damage participants + last hit; Canary also credits no-damage party members under shared exp.
- `bestiary-action-failed` should be routed to both modals' sessions client-side (currently mis-routed).
- Opening two creature sheets within the 300 ms cooldown surfaces a transient rate-limit error instead of queueing the second request.

## Implementation
- Credit set computed in `server/src/bestiary/BestiaryHooks.ts` using party shared-exp eligibility from `server/src/party/getPartyExperienceShares.ts` (execution-time membership, same source as exp shares).
- Error routing + cooldown queueing are client-side fixes in `client/components/bestiary/`.

## Tests
- No-damage party member under active shared exp receives kill credit; a non-eligible member does not.
- Client queues the second sheet request within the cooldown window instead of erroring.

## Dependencies
- Party shared-exp eligibility (shipped).
