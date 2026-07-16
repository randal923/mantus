# NPC content and import

Part of [`10-npcs`](10-npcs.md). Depends on the shared
[`creature/spawn runtime`](04-creatures-spawns-and-ai.md).

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

## Planned file surface

- Content: `content/npcs/`, typed schema, importer/validator and unsupported
  behavior report.
- Server: `server/src/npc/NpcType.ts`.

## Required tests

- [ ] Spawn positions and definitions resolve without executing Lua.
- [ ] Import fails closed on missing definitions, duplicate ids, blocked
  positions, and unsupported callbacks.

[Back to overview](README.md)
