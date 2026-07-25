# Feature 51 — Use-with tool actions (remaining)

Part of [Todo 13 — Typed world actions](todo-13.md).

Machete, scythe, pick, crowbar, watch/clock and the fishing rod shipped
2026-07-25 — see the
[completed log](completed/implementation-feature-51-completed.md).

## Remaining work

- **Rope on open holes.** Canary's `holeId` list pulls players and movable
  items *up* from the floor below; that needs a pull-through-floor move, which
  `MovementHandler` does not have. Name-matched `rope-or-shovel` converter
  actions stay disabled — the list is too noisy.
- **Shovel sand digging (item 231).** Scarab coins/spawns and quest digs; needs
  the loot RNG plus spawn hooks from todo-9.
- **Toolgear jam.** Canary's 9594/9596/9598 multi-tools jam 5 % of uses,
  transforming to `itemid + 1` and decaying back after a minute. The ids are
  registered as their single-tool equivalents (as Canary's own allowlists do);
  the jam needs a carried-item transform-and-decay path.
- **Tool list is curated.** `getToolDefinition` is an id list, not DAT
  `multiUse`/`usable` bits — `importTibiaAssets.mjs` parses but drops those
  flags, and capturing them means regenerating `objects.json`.
- **Use-with targets other than a map tile.** No tool-on-ground-item,
  tool-on-creature, or tool-on-inventory-item (fluid containers).
- Dawnport 7749 tutorial pile is storage-gated (defers to the quest storage
  platform). Item 867 stays a use-activated dropdown; 21341 is excluded.
- Every quest-storage branch of `onUsePick`, `onUseCrowbar`, `onUseSpoon` and
  `onUseKitchenKnife` defers to the quest storage platform. The crowbar is
  registered but has no non-quest branch at all, so it always fails closed —
  which is also what Canary does for a player without the storage.

## Tests

- Forged target tile (out of reach, wrong type) rejected for each tool — **done**.
- Replayed fishing use consumes exactly one worm — **done** (the worm and the
  catch are one conjure).
- Skill/catch roll is never client-influenced — **done**.

## Dependencies

- Loot RNG + spawn hooks (sand digging) — todo-9 loot infrastructure.
- Feature 103/105 (quest storage platform) for the Dawnport 7749 tutorial pile
  and quest digs.
- Feature 52 for `multiUse`/`usable` flag parsing overlap in the importer.
