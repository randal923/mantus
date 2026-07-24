# Feature 39 — NPC import validation and parity reports

Part of [Todo 11 — NPCs, dialogue, and travel](todo-11.md).

## Why
The importer already records every source, shop row, unselected definition, and procedural gap, but some validations run only live at execution time instead of failing the import, and the parity report is not yet gated by tests that force it to zero.

## Remaining work
- Validate during import: missing definitions, aliases, blocked positions, duplicate ids, unavailable destinations, unsupported callbacks. Blocked-position and alias validation at import time are not confirmed complete.
- Whole-world unavailable-destination report is missing — destination walkability is checked live at execution, not at import.
- Tests: spawn positions/definitions resolve without executing Lua; import fails closed on missing definitions, duplicate ids, blocked positions, unsupported callbacks; NPC parity report reaches zero unreviewed callbacks, zero ignored assignments, zero ambiguous variants, zero silently omitted placements.

## Implementation
- Extend `tools/importCanaryNpcs.mjs` and `server/src/npc/loadNpcDialogueGraphs.ts` (plus its test) with the missing import-time validations.
- The whole-world destination report needs converter walkability data available at import time (the OTBM converter's walkability output — see the map pipeline) so every travel destination can be proven walkable statically, not just via the existing ten-destination world-map fixture.
- Parity-zero test asserts directly on `content/npcs/canary-npc-import-report.json` counts, mirroring the spell-catalog gate pattern (`loadCanarySpellCatalog.test.ts`).
- Keep the fail-closed loader behavior: mismatched source commit, duplicate node/offer ids, duplicate child/choice references, missing references, unknown NPC types, unsupported actions, out-of-range content all reject.

## Tests
- Import fails closed on each injected defect class: missing definition, duplicate id, blocked position, unsupported callback, unavailable destination.
- Spawn positions and definitions resolve without executing Lua.
- Parity-report gate: zero unreviewed callbacks / ignored assignments / ambiguous variants / silently omitted placements (initially asserting non-increase, tightening to zero as Feature 38 lands).

## Dependencies
- Feature 38 (typed commands) — the report can only reach zero as command families land.
- Map-converter walkability data (shipped pipeline) for the destination report.
