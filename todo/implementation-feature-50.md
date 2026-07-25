# Feature 50 — Remaining world-action kinds (chests, pressure plates, fields)

Part of [Todo 13 — Typed world actions](todo-13.md).

Chests, pressure plates and traps shipped 2026-07-25, and the teleport
exploit-test box was closed earlier the same day — see the
[completed log](completed/implementation-feature-50-completed.md). **Fields and
the recorded dropdown deviations are all that is left.**

## Remaining work

- **Fields (fire/energy/poison).** Blocked on content: the pinned item catalog
  imports `kind: "magicfield"` for 45 types but no `field` payload, so there is
  no damage/duration data to drive them. `tools/importTibiaAssets.mjs` needs to
  emit `ItemType.field` (declared, always undefined today) before the
  combat-damage hook can be written. Recorded in `TODO.md` as an accepted gap.
- **Trap disarm on use.** `data-otservbr-global/scripts/actions/other/trap.lua`
  transforms a sprung spike trap (3482 → 3481) when used. Classified
  `deferred` in `content/canary-world-action-parity.json`; the step-in half
  ships in `PressurePlateRegistry`.
- **Recorded dropdown deviations**, still unresolved:
  - Oramond sewer grate 21298 drops one floor here vs two floors + one tile
    east in Canary's quest script.
  - Dropdowns over blocked/missing destination tiles are disabled at conversion
    time instead of Canary's `FLAG_NOLIMIT` force-teleport.

## Tests

- Replayed chest use yields exactly one loot grant — **done**.
- Forged action id/target/position/destination rejected for each new kind —
  **done** for chests and plates; extend when fields land.
- Simultaneous teleport users leave coherent state — **done**.

## Dependencies

- Feature 103/105 (quest storage platform) for storage-gated chest variants:
  the 43 chests outside `quest_reward_common.lua`'s uid ranges defer there.
- Asset-import work for `ItemType.field`.
