# Feature 51 — completed

Use-with tool actions, from
[implementation-feature-51.md](../implementation-feature-51.md).

Cross-links: [implementation-feature-51.md](../implementation-feature-51.md) ·
[todo-13.md](../todo-13.md).

---

## 2026-07-25 — Machete, scythe, pick, crowbar, watch, fishing rod

**Problem.** Only rope and shovel existed; the rest of the classic tool family
was missing, so those items presented no crosshair and did nothing.

**What changed.** `getToolDefinition` grows to seven kinds (rope, shovel,
machete, scythe, pick, crowbar, fishing-rod) with Canary's own id allowlists,
including the "gear of eliteness" multi-tool ids each Lua handler accepts.
`ToolUseHandler` gained a shared `ToolUseContext` and per-tool handlers:

- `handleMacheteUse` — jungle grass and reed cuts (catalog decay regrows them),
  wild growth cleared outright with a poff.
- `handleScytheUse` — burning sugar cane, wheat, reed; each drops its bunch on
  the tile through `createEventWorldItem`, matching `Game.createItem`.
- `handlePickUse` — the earth dig, and the crushable boulder whose coin flip is
  rolled by `WorldActionRng` and can release a frazzlemaw through the spawn
  runtime.
- `handleFishingUse` — the water-id whitelist, Canary's catch chance
  `min(max(10 + (skill - 10) * 0.597, 10), 50)` read from the server's own
  fishing skill, the ice-hole/sand/dirty-water/elemental-remains arms with their
  rarity tables, and the fishing-skill advance. The worm and the catch commit
  together as one conjure, so bait can never be spent without its result.
- Crowbar is registered but fail-closed: every branch of Canary's
  `onUseCrowbar` is gated on a quest storage value.

Clocks and watches (Canary's `watch.lua`) became a `clock` world-action kind
plus `ClockHandler` for the two carried watches, both answering from
`worldTimeOfDay` — Canary's light clock, one Tibian day per real hour in
four-light-minute steps. The clock arm outranks the generic rotate behaviour of
the same pendulum-clock ids, as the Action registration does in Canary.

Reach is validated per tool: adjacency by default, and Canary's `allowFarUse`
for the fishing rod bounded to the same floor, 7×5 tiles, and line of sight.

**Files touched.** `server/src/item/getToolDefinition.ts`,
`server/src/action/{ToolUseHandler,ToolUseContext,handleMacheteUse,handleScytheUse,handlePickUse,handleFishingUse,harvestTables,fishingTables,ClockHandler,clockItemIds,handleClockRead,worldTimeOfDay}.ts`,
`server/src/action/{WorldAction,WorldActionContext,WorldActionRegistry,resolveWorldAction}.ts`,
`server/src/GameServer.ts`.

**How it was verified.** `ToolUseHandler.test.ts` (18 cases, including forged
targets out of reach, a harvest on a bare tile, the cross-floor far-use refusal,
no-bait fishing, and the crowbar fail-closed path), `worldTimeOfDay.test.ts`
(3), and a clock case in `WorldActionRegistry.test.ts`.

**Residual risk.** Rope on open holes (pull-up through a floor), sand digging
with loot RNG, and the toolgear jam are not implemented — see the feature file.
