# NPC content and import

Part of [`10-npcs`](10-npcs.md). Depends on the shared
[`creature/spawn runtime`](04-creatures-spawns-and-ai.md).

## NPC content

- [x] Import every NPC placement from the OTBM-referenced external NPC spawn
  XML: center/radius, x/y offsets, `centerz`, direction, and matched type id.
- [ ] Define typed `NpcType` data for name/outfit/speed, home/leash behavior,
  speech triggers, dialogue graph, travel offers, shop id, quest/storage gates,
  and scripted action references.
- [ ] Never execute imported Lua. Represent every dialogue/action in a small
  reviewed data model; implement procedural behavior as explicit TypeScript
  commands.
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
- [ ] The NPC parity report reaches zero unreviewed callbacks, ignored gameplay
  assignments, ambiguous variants, or silently omitted placements.

## Implemented vertical slice (2026-07-17)

- The existing pinned world import contains all 1,008 external NPC placements
  and 956 resolved NPC types without executing Lua. Ambiguous script variants
  remain explicitly disabled in `content/spawns/world-import-report.json`.
- `content/npcs/canary-dialogues.json` contains reviewed typed content for
  Quentin and Captain Bluebear, pinned to the same Canary commit as the
  creature import. The loader rejects mismatched commits, duplicate node/offer
  ids, duplicate child/choice references, missing references, unknown NPC
  types, unsupported actions, and out-of-range content. A world-map fixture
  also proves all ten reviewed travel destinations currently resolve to a
  walkable tile.

## Known remaining gaps

- Canary's 1,061 NPC Lua source files are not yet converted. The parity
  inventory therefore correctly remains blocked for 954 additional NPC types
  and for the unconverted branches/actions of Quentin and Captain Bluebear.
  Add reviewed typed graphs and explicit TypeScript actions incrementally; do
  not execute or embed a general Lua evaluator.
- Destination walkability is checked against the live map at action execution,
  but the content import does not yet emit a whole-world unavailable-destination
  report. Add that report when the full NPC content importer is built.

[Back to overview](README.md)
