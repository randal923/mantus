# Feature 41 — Gated and quest travel routes

Part of [Todo 11 — NPCs, dialogue, and travel](todo-11.md).

## Why
The travel slice ships 90 unconditional pinned routes; every conditional route (storage gates, quest boats, discounts) was deferred because it needs typed quest/action support. Gated routes must never be enabled without their execution-time access check.

## Remaining work
- Storage-gated Yalahar and Goroma passages.
- Remaining quest/event boats.
- Postman discounts plus travel-triggered Postman mission side effects.
- `kick` actions.
- All await typed quest/action support (Feature 103); never expose raw storage ids to the client; never enable a route without its execution-time access check.

## Implementation
- Add routes to `server/src/npc/boatTravelRoutes.ts` and gating to `server/src/npc/TravelService.ts`, with the storage-gate condition evaluated at confirmation execution inside the tick — not when the offer was shown (charter rule 4).
- Discounts modify the server-owned fare before the serializable payment transaction in `server/src/npc/PgNpcTravelStore.ts`; the client never supplies a price (charter rule 1).
- Mission side effects run as typed post-travel commands inside the same serializable transaction and audit trail as the fare (charter rules 2/11), following the shipped pattern: fare + character position/version + item-destruction audits + travel audit in one transaction before the tick teleports.
- Keep destination walkability validation with safe fallback and full visibility/tile-state reconciliation after travel, as shipped.

## Tests
- In `server/src/npc/TravelService.test.ts`: storage-gate bypass attempts rejected at confirmation time; forged route ids rejected; discount forging (client-claimed Postman status) rejected.
- Concurrent confirmations still cannot double-charge or travel unpaid (existing invariant extended to gated/discounted fares).
- Mission side effects apply exactly once per travel, atomic with payment.

## Dependencies
- Feature 103 (quest platform) for storage gates and quest state; Feature 105 for Postman quest content.
- Feature 38 (typed commands) for kick/mission-side-effect command families.
