# Todo 13 — Quests

**Feature 105 (remainder).** The platform chain shipped 2026-07-26 — see
[done.md](done.md): Feature 103 (QuestService write path, alias
canonicalization, `-1`-erases semantics, fail-closed catalog/alias
loaders), Feature 104 (quest-log protocol/UI transcribed from
quests.lua:1005-1198, chest `storageWrites` with the `quest-reward` audit,
migration 062), and Feature 105's inventory slice
(`tools/importCanaryQuests.mjs`: 51 quests / 456 missions / 2148 storage
names / 114 script dirs, parity gate `questCatalogParity.test.ts`). The
quest log serves the real pinned catalog end-to-end.

## Feature 105 — Full quest-content inventory (remainder)

Turn the inventory into complete behavior parity. Every remaining item is
listed in `content/quests/canary-quest-import-report.json` as
`pending-behavior`, never silently dropped.

**Remaining work**

- The 114 quest script directories' behavior: storage-gated doors
  (`handleDoorUse` "quest" variant is the fail-closed insertion point),
  pressure plates (`PressurePlateRegistry.enforceGate`), crowbar/pick and
  tool branches (`ToolUseHandler`), storage-gated teleports/tiles
  (todo-2), one-time storage-keyed chest placements (extend
  `chests.json` `storageWrites`, shipped 2026-07-26), quest-gated NPC
  dialogue branches (todo-7), the 67 recorded creature variants (todo-3),
  and the Dawnport 7749 pile / quest-dig branches (todo-2). Extraction of
  per-position gates needs per-script review — the actions/movements Lua
  is imperative, not declarative like the catalog.
- Dynamic mission descriptions/states (classified `dynamicDescription`/
  `dynamicStates` in the catalog): each needs its pinned per-player
  formula; the runtime currently shows Canary's own missing-state
  fallback for them.
- The KV-backed quest tracker (`quest-tracker` scope, packet 0xD0
  sub-bytes) once a tracker UI lands.
- Upstream oddities carried losslessly and worth revisiting on a repin:
  numeric-only storage keys without names, and catalog references to
  storage TABLES (dead missions upstream too, e.g. Tibia Tales'
  ToOutfoxAFoxQuest).

**Tests:** parity gate at zero missing definitions/transitions/callbacks
(extend `questCatalogParity.test.ts` as behaviors land); spot scenario
tests per consumer (door gating, one-time chest, storage-gated teleport,
quest-gated dialogue branch).

[Back to overview](README.md)
