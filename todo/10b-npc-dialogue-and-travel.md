# NPC runtime, dialogue, and travel

Part of [`10-npcs`](10-npcs.md). Depends on
[`10a-npc-content`](10a-npc-content.md) and [`chat`](09-chat.md). Shop
money/item transfers are delegated to [`11b-npc-shops.md`](11b-npc-shops.md).

## Runtime and dialogue

- [ ] Model NPCs as creatures so occupancy, movement, visibility, and rendering
  use the same z-aware paths as players/monsters.
- [ ] Add a typed dialogue graph with explicit node ids, input matches, response,
  conditions, and server action. Avoid an open-ended scripting evaluator.
- [ ] Keep conversation/focus state per NPC and character with server-clock
  timeout, range/floor checks, and cleanup on logout/death/removal.
- [ ] Re-check range, floor, state, quest requirements, money/items, and travel
  destination at the exact node/action execution time.
- [ ] Route hello/goodbye/local NPC speech through the visibility-aware chat
  system; private dialogue state is sent only to that player.
- [ ] Implement greeting, keyword branching, information, quest hooks, and
  travel first; shops call the atomic economy service. Continue until every
  pinned NPC dialogue branch, focus rule, action, travel offer, shop link, and
  storage gate is represented.

## Travel safety

- [ ] Treat travel as an intent outcome. Validate eligibility/cost, reserve and
  commit payment atomically, and choose a server-known destination.
- [ ] Validate destination walkability and fall back safely; never accept client
  coordinates.
- [ ] Reconcile complete visibility/tile state after travel like any teleport.

## Planned file surface

- Server: `server/src/npc/Npc.ts`, `NpcHandler.ts`, `DialogueGraph.ts`,
  `NpcConversation.ts`, `TravelService.ts`.
- Protocol/client: NPC dialogue state/actions and
  `client/components/npc/NpcDialogue.tsx` if a dedicated panel is desired.

## Required tests

- [ ] Dialogue state cannot be stolen, replayed across NPCs, or continued after
  range/floor/logout timeout.
- [ ] Forged dialogue node/action ids, quest state, prices, and destinations are
  ignored/rejected.
- [ ] Concurrent travel/payment cannot double-charge or travel without payment.
- [ ] NPC private state and offers are delivered only to the relevant player.
- [ ] NPC parity fixtures prove every imported dialogue/action has an executable
  typed path or an explicit non-content classification.

[Back to overview](README.md)
