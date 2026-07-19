# NPC runtime, dialogue, and travel

Part of [`10-npcs`](10-npcs.md). Depends on
[`10a-npc-content`](10a-npc-content.md) and [`chat`](09-chat.md). Shop
money/item transfers are delegated to [`11b-npc-shops.md`](11b-npc-shops.md).

## Runtime and dialogue

- [x] Model NPCs as creatures so occupancy, movement, visibility, and rendering
  use the same z-aware paths as players/monsters.
- [ ] Add a typed dialogue graph with explicit node ids, input matches, response,
  conditions, and server action. Avoid an open-ended scripting evaluator.
- [x] Keep conversation/focus state per NPC and character with server-clock
  timeout, range/floor checks, and cleanup on logout/death/removal.
- [ ] Re-check range, floor, state, quest requirements, money/items, and travel
  destination at the exact node/action execution time.
- [x] Route hello/goodbye/local NPC speech through the visibility-aware chat
  system; private dialogue state is sent only to that player.
- [ ] Implement greeting, keyword branching, information, quest hooks, and
  travel first; shops call the atomic economy service. Continue until every
  pinned NPC dialogue branch, focus rule, action, travel offer, shop link, and
  storage gate is represented.

## Travel safety

- [x] Treat travel as an intent outcome. Validate eligibility/cost, reserve and
  commit payment atomically, and choose a server-known destination.
- [x] Validate destination walkability and fall back safely; never accept client
  coordinates.
- [x] Reconcile complete visibility/tile state after travel like any teleport.

## Planned file surface

- Server: `server/src/npc/Npc.ts`, `NpcHandler.ts`, `DialogueGraph.ts`,
  `NpcConversation.ts`, `TravelService.ts`.
- Protocol/client: NPC dialogue state/actions and
  `client/components/npc/NpcDialogue.tsx` if a dedicated panel is desired.

## Required tests

- [x] Dialogue state cannot be stolen, replayed across NPCs, or continued after
  range/floor/logout timeout.
- [x] Forged dialogue node/action ids, quest state, prices, and destinations are
  ignored/rejected.
- [x] Concurrent travel/payment cannot double-charge or travel without payment.
- [x] NPC private state and offers are delivered only to the relevant player.
- [ ] NPC parity fixtures prove every imported dialogue/action has an executable
  typed path or an explicit non-content classification.

## Implemented vertical slice (2026-07-17)

- Per-NPC/per-character conversations use opaque server-issued ids, explicit
  offered choices, server-clock expiry, range/floor cleanup, and private
  delivery. NPC wandering pauses while at least one conversation is active.
- Captain Bluebear exposes ten unconditional pinned routes. Confirmation sends
  only an opaque choice; fare and destination remain server-owned. Fare,
  character position/version, item-destruction audits, and the travel audit
  commit in one serializable PostgreSQL transaction before the tick teleports
  and fully reconciles visibility.
- Quentin currently provides greeting, healing fallback, pilgrimage, and
  blessing information. Stateful healing, blessings, stake/adventurer-stone
  quests, and item grants remain unimplemented rather than being approximated
  client-side.
- All 949 interactive world NPC types now have a safe generated greeting,
  farewell, walk-away, literal keyword-tree baseline, and typed shop/bank link
  where declared. For example, Rudolph responds to `hi` with his pinned text
  and opens his nine-offer clothing catalog from `trade`.

## Known remaining gaps

- Travel currently spends carried gold and platinum coin stacks, returning
  exact gold change in the same audited transaction. Canary's
  `removeMoneyBank` also handles crystal conversion and bank balance. Implement
  the canonical denomination/bank ledger in
  [`11a-currency-and-bank`](11a-currency-and-bank.md), then route travel fares
  through it without weakening the existing atomic transaction and audits.
- Captain Bluebear's Yalahar storage gate, Postman discount, Carlin mission
  side effect, and `kick` action require typed quest/action support. Add those
  with [`20a-quest-state`](20a-quest-state.md); do not expose raw storage ids to
  the client.
- The generated baseline covers literal parent/child keyword trees, shop links,
  and bank links, but the import report still owns 2,307 procedural keyword
  actions, 21 dynamically composed messages, and 601 custom callbacks. Delayed
  speech, dynamic profession/quest greetings, quest rewards, blessings, and
  remaining travel/state mutations need explicit TypeScript commands before
  the broad parity boxes can close.

[Back to overview](README.md)
