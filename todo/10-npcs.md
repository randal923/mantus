# NPCs, dialogue, and travel

Depends on the shared [`creature/spawn runtime`](04-creatures-spawns-and-ai.md)
and [`chat`](09-chat.md). Shop money/item transfers are delegated to
[`11-economy.md`](11-economy.md).

## NPC content

- [ ] Import allowed NPC placements from the OTBM-referenced external NPC spawn
  XML: center/radius, x/y offsets, `centerz`, direction, and matched type id.
- [ ] Define typed `NpcType` data for name/outfit/speed, home/leash behavior,
  speech triggers, dialogue graph, travel offers, shop id, quest/storage gates,
  and scripted action references.
- [ ] Never execute imported Lua. Represent supported dialogues/actions in a
  small reviewed data model; implement procedural behavior as explicit
  TypeScript commands.
- [ ] Validate missing definitions, aliases, blocked positions, duplicate ids,
  unavailable destinations, and unsupported callbacks during import.

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
  travel first; shops call the atomic economy service.

## Travel safety

- [ ] Treat travel as an intent outcome. Validate eligibility/cost, reserve and
  commit payment atomically, and choose a server-known destination.
- [ ] Validate destination walkability and fall back safely; never accept client
  coordinates.
- [ ] Reconcile complete visibility/tile state after travel like any teleport.

## Planned file surface

- Content: `content/npcs/`, typed schema, importer/validator and unsupported
  behavior report.
- Server: `server/src/npc/Npc.ts`, `NpcType.ts`, `NpcHandler.ts`,
  `DialogueGraph.ts`, `NpcConversation.ts`, `TravelService.ts`.
- Protocol/client: NPC dialogue state/actions and
  `client/components/npc/NpcDialogue.tsx` if a dedicated panel is desired.

## Required tests

- [ ] Spawn positions and definitions resolve without executing Lua.
- [ ] Dialogue state cannot be stolen, replayed across NPCs, or continued after
  range/floor/logout timeout.
- [ ] Forged dialogue node/action ids, quest state, prices, and destinations are
  ignored/rejected.
- [ ] Concurrent travel/payment cannot double-charge or travel without payment.
- [ ] NPC private state and offers are delivered only to the relevant player.

[Back to overview](README.md)
