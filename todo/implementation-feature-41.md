# Feature 41 — Gated and quest travel routes

Part of [Todo 11 — NPCs, dialogue, and travel](todo-11.md).

The gating and discount **engine** shipped 2026-07-25 — execution-time
`conditions` on travel offers, server-computed `discounts`, a `not-allowed`
outcome that never names the gate. See the
[completed log](completed/implementation-feature-41-completed.md). This file
tracks the route content, which needs a Canary checkout.

## Remaining work — content

All of these are entries in `content/npcs/canary-npc-import-report.json` that
the importer could not type. Transcribing them means reading the pinned Lua, so
they need a Canary checkout (`CANARY_PATH`); no `.lua` is vendored here.

- **Storage-gated Yalahar and Goroma passages.** Add the offers to
  `server/src/npc/boatTravelRoutes.ts` with their `conditions`; the engine
  evaluates them at confirmation.
- **Six remaining `StdModule.travel` boats** — `captain-chelop`,
  `captain-cookie`, `captain-fearless`, `captain-pelagia`,
  `captain-waverider-island`, `jack-fate`.
- **Three `townTravelHandler` branches** on `captain-dreadnought`.
- **24 `StdModule.kick` handlers**, every one flagged `nonLiteralDestination`:
  the destination is computed in Lua rather than written literally, so each
  needs its source read. The `teleport` action kind that executes them already
  exists (Feature 38) — this is purely the destination table.
- **Postman discounts and travel-triggered mission side effects.** The discount
  half needs only the Postman rank storage keys (Feature 105 content); the
  `discounts` mechanism is shipped. Mission side effects must run as typed
  post-travel commands inside the fare's own transaction and audit trail.

## Tests

- Extend `TravelService.test.ts` per route family once the content lands: a
  forged route id is rejected, and a gated route stays refused when the quest
  storage is absent.
- Mission side effects apply exactly once per travel, atomic with payment.

## Dependencies

- A Canary checkout for every item above (see the
  [canary-checkout-required](../MEMORY.md) note).
- Feature 105 for Postman quest content.
