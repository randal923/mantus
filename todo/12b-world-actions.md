# Typed world actions

Part of [`12-quests-and-world-actions`](12-quests-and-world-actions.md).
Depends on atomic [`items`](05-items-and-inventory.md), complete map
semantics, and [`12a-quest-state`](12a-quest-state.md) for storage-gated
actions. World actions are typed server behaviors, never imported scripts
executed at runtime.

## Typed world actions

- [ ] Build a small action registry keyed by item type/action id with explicit
  handlers and schemas. Unknown actions fail closed.
- [ ] Implement in increments: doors/key doors/level doors, levers/switches,
  one-time/repeatable chests, pressure plates, teleports, fields, readable and
  writeable objects (including map signs via use-map), rope spots,
  holes/shovel, and decay/transforms.
- [ ] Implement use-with tool actions from the 2026-07-18 Canary use-surface
  audit: fishing rod (water whitelist, worm consume, skill-based catch roll,
  fishing skill advance — all server RNG), machete/jungle grass,
  scythe/wheat, pick, crowbar, and the watch (game-time reply). Same
  registry, same execution-time re-checks.
- [ ] Support map-item rotation and generic transform-on-use for world items
  (Canary `m_transformOnUse`; ~1007 catalog types carry `rotateTo`) — the
  carried-item rotate path exists, map furniture has no handler.
- [x] Implement use-activated dropdowns (sewer grates, closed trapdoors, large
  holes, grilles): use moves the player one floor down after server-side
  destination checks, mirroring the ladder action in reverse. Identify them in
  the converter as `primaryType === "dropdowns"` without `floorChange`
  (ids 435/7750/21298, 475/8708/21374, 867/7523/7524, 22750) rather than by
  name matching, and emit them as enabled `use` world actions alongside
  ladders. Known deviations from Canary, revisit with the action registry:
  the Oramond sewer grate 21298 drops one floor here but two floors and one
  tile east in Canary's quest script, and dropdowns over a blocked or missing
  tile are disabled at conversion instead of force-teleporting the player the
  way Canary's `FLAG_NOLIMIT` teleport does.
- [ ] At execution re-check current item/version, position, reach, floor/LOS,
  requirements, cooldown, target, destination, and resulting capacity/state.
- [ ] Apply tile/item/quest changes synchronously in the tick and persist every
  coupled durable outcome atomically. Do not await between validation and
  mutation.
- [ ] Filter resulting tile/effect messages through ordinary visibility.
- [ ] Inventory and implement every pinned action, move event, use callback,
  step-in/out, equip/de-equip hook, creature event, and map-scripted
  interaction as typed project-native behavior.

## Planned file surface

- `server/src/action/WorldAction.ts`, `WorldActionRegistry.ts`, and focused
  handler files.
- Action protocol projections and client read/write/action UI.

## Required exploit tests

- [ ] A chest replay grants its item/gold once, including concurrent intents
  and reconnects.
- [ ] Forged action id, target, position, and destination are rejected.
- [ ] Door/lever/teleport state remains coherent for simultaneous users.
- [ ] The action parity report reaches zero unsupported registered actions or
  silently ignored action/movement fields.

[Back to overview](README.md)
