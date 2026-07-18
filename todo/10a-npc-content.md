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

## Implemented baseline (2026-07-17)

- The existing pinned world import contains all 1,008 external NPC placements
  and 956 resolved NPC types without executing Lua. Ambiguous script variants
  remain explicitly disabled in `content/spawns/world-import-report.json`.
- `tools/importCanaryNpcs.mjs` statically parses the exact 956 world-selected
  definitions without running Lua. It generates conversational baselines for
  all 949 interactive types, including 6,745 literal keyword/shop/bank nodes,
  and classifies the seven deliberately non-interactive types. Reviewed graphs
  in `content/npcs/canary-dialogues.json` override this baseline.
- `content/npcs/canary-npc-import-report.json` records every selected source,
  all shop rows/callbacks, all 80 unselected global NPC sources, and every
  procedural dialogue gap. Source commit, definition count, and aggregate hash
  are pinned in the manifest.
- The loader rejects mismatched commits, duplicate node/offer ids, duplicate
  child/choice references, missing references, unknown NPC types, unsupported
  actions, and out-of-range content. A world-map fixture proves all ten reviewed
  travel destinations currently resolve to a walkable tile.

## Known remaining gaps

- The baseline intentionally does not execute or approximate 2,307 procedural
  keyword actions, 21 dynamically composed messages, or the 601 custom dialogue
  callbacks present in 494 selected definitions. Add reviewed typed
  quest/travel/blessing/action commands until the report reaches zero; do not
  execute or embed a general Lua evaluator.
- Three Black Bert shop rows reference item ids absent from the pinned Canary
  item catalog. They remain explicit source-invalid exclusions in the report.
- Destination walkability is checked against the live map at action execution,
  but the content import does not yet emit a whole-world unavailable-destination
  report. Add that report when the full NPC content importer is built.

[Back to overview](README.md)
