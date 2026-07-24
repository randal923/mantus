# Feature 37 — Complete typed NpcType data model

Part of [Todo 11 — NPCs, dialogue, and travel](todo-11.md).

## Why
The NPC importer resolves 956 world types and generates dialogue baselines, but the `NpcType` data model does not yet carry every behavior field typed. A complete typed model is the foundation the typed-command and dialogue-graph features build on.

## Remaining work
- Typed `NpcType` data for: name/outfit/speed, home/leash behavior, speech triggers, dialogue graph reference, travel offers, shop id, quest/storage gates, scripted action references.

## Implementation
- Extend `server/src/creature/NpcType.ts` — note the path correction: it lives in `server/src/creature/`, not the originally planned `server/src/npc/`.
- Extend the content schema loaded by `server/src/npc/loadNpcDialogueGraphs.ts` and emit the new fields from `tools/importCanaryNpcs.mjs` (static parse only — never executing Canary Lua).
- Quest/storage gates are typed references validated by the loader; never expose raw storage ids to the client.
- Loader keeps failing closed: mismatched commits, duplicate ids, missing references, unknown types, unsupported actions, out-of-range content all reject at load.

## Tests
- Loader rejects content with unknown/missing fields for the new typed surface.
- Round-trip: importer output for a sampled definition matches the pinned Canary source fields.
- Existing invariants keep holding (all reviewed travel destinations resolve to walkable tiles via the world-map fixture).

## Dependencies
- Feature 103 (quest platform) for quest/storage gate semantics — the typed fields can land first with gates inert until 103 ships.
- Features 38–40 consume this model.
