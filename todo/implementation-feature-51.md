# Feature 51 — Use-with tool actions (fishing, machete, scythe, pick, crowbar, watch)

Part of [Todo 13 — Typed world actions](todo-13.md).

## Why
The use-with plumbing exists (rope spots and shovel-on-closed-holes shipped through `ToolUseHandler`), but the rest of the classic tool family is missing, and the current tool list is curated rather than derived from DAT metadata.

## Remaining work
- Fishing rod: water-tile whitelist, worm consumption, skill-based catch roll, fishing skill advance — all RNG server-side.
- Machete on jungle grass; scythe on wheat; pick; crowbar; watch (game-time reply).
- Rope on open holes (Canary `holeId` list) — pull players/items up from below; needs a pull-through-floor move. Name-matched `rope-or-shovel` converter actions stay disabled — the list is too noisy.
- Shovel sand digging (item 231): scarab coins/spawns and quest digs — needs loot RNG + spawn hooks.
- Tools are a curated id list (`server/src/item/getToolDefinition.ts`), not DAT `multiUse`/`usable` bits — `importTibiaAssets.mjs` parses but drops those flags; capturing them means regenerating `objects.json`.
- Use-with only works carried-tool → map-tile; no tool-on-ground, tool-on-creature, or tool-on-inventory-item targets (e.g. fluid containers).
- Dawnport 7749 tutorial pile is storage-gated (defers to the quest storage platform). Item 867 stays a use-activated dropdown; 21341 is excluded.

## Implementation
- Extend `server/src/action/ToolUseHandler.ts` (+ `server/src/item/getToolDefinition.ts`) with per-tool handlers using the same execution-time re-checks as rope/shovel: tool ownership, adjacency/reach, target tile state, cooldown — all re-validated in the tick, never trusted from the intent.
- All rolls (catch, sand loot) are server-side RNG; the client never influences outcomes.
- Grass/wheat transforms reuse `shovelHolePairs.ts`-style pair tables plus catalog decay for regrowth.
- Fishing skill advance ties into the skills system.
- Optional flag capture: parse `multiUse`/`usable` in `tools/importTibiaAssets.mjs` and regenerate `objects.json` if moving off the curated list.

## Tests
- Forged target tile (out of reach, wrong type) rejected for each tool.
- Replayed fishing use consumes exactly one worm.
- Skill/catch roll is never client-influenced (no client-supplied randomness reaches the roll).

## Dependencies
- Loot RNG + spawn hooks (sand digging) — todo-9 loot infrastructure.
- Feature 103/105 (quest storage platform) for the Dawnport 7749 tutorial pile and quest digs.
- Feature 52 for `multiUse`/`usable` flag parsing overlap in the importer.
