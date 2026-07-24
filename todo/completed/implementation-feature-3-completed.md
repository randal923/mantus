# Feature 3 — completed

Cross-links: [implementation-feature-3.md](../implementation-feature-3.md) ·
[todo-3.md](../todo-3.md).

---

## 2026-07-24 — pz-lock enforcement on use/levitate paths + PZ status icon

**Problem.** A pz-locked player could enter a protection zone through a
ladder/hole/rope-spot use or via `exani hur` (levitate), because those paths
never re-checked pz-lock against a protection-zone destination the way normal
walking does in `tryMoveInternal`. Charter rule 8: every limit the walk path
enforces must hold on every path.

**What changed.**

- `server/src/world/MovementRules.ts` — added a single `pzBlocked(player,
  destination)` helper (`conditions.has("pz-lock")` AND destination tile
  `protectionZone`). Wired it into all three position-change paths:
  - `tryMoveInternal` (walk) now calls the helper instead of the inline check.
  - `tryUseAction` (backs `tryUseMap`/`tryUseRopeSpot` — ladder/hole/rope)
    rejects before the house-block check.
  - `tryLevitate` rejects alongside its walkability/house/occupancy checks.
  All checks stay at execution time inside the tick.
- `server/src/gridMapData.ts` — added a `protectionZones?: [x,y,z][]` option so
  tests can flag PZ tiles (previously hardcoded `protectionZone: false`).

**PZ status bar indicator (requested alongside the fix).**

- `protocol/src/combat.ts` — added `inProtectionZone: boolean` to
  `fightStateSchema`.
- `server/src/combat/projectFightState.ts` — projects it from
  `world.isProtectionZone(player.position)`. Own-tile only, so no over-sharing
  (charter rule 6). Correct at login (welcome) and on respawn (DeathHandler
  already re-sends fight-state).
- `server/src/GameServer.ts` — the `onPlayerStepped` movement callback now
  pushes a fresh `fight-state` when a step crosses the PZ boundary
  (`isProtectionZone(from) !== isProtectionZone(now)`). Covers walk, auto-walk,
  use-map, rope, and levitate (all funnel through `publishResult`).
- `client/components/combat/ProtectionZoneIndicator.tsx` (new) — renders the
  `protection_zone.png` state icon + label when `fightState.inProtectionZone`.
- `client/components/GameHud.tsx` — renders it atop the top-left status stack.
- `client/locales/{en,pt-BR}.json` — added `combat.protectionZone`.

**Files touched.** `server/src/world/MovementRules.ts`,
`server/src/gridMapData.ts`, `server/src/combat/projectFightState.ts`,
`server/src/GameServer.ts`, `server/src/World.test.ts`,
`protocol/src/combat.ts`, `client/components/GameHud.tsx`,
`client/components/combat/ProtectionZoneIndicator.tsx`,
`client/lib/combat/anchorFightStateCooldowns.test.ts`,
`client/stories/GameHud.stories.tsx`, `client/locales/en.json`,
`client/locales/pt-BR.json`.

**Verification.**

- New regression tests in `server/src/World.test.ts` (`describe("pz-lock
  blocks protection-zone transitions")`): a pz-locked player is rejected on the
  ladder, rope-spot, and levitate paths into a PZ tile (position unchanged).
  `yarn workspace server test run src/World.test.ts` → 34 passed.
- `yarn typecheck` (protocol + server + client) clean.
- Regressions checked: server World/Combat/GameServer/Visibility suites (124
  passed), client `anchorFightStateCooldowns` (spread preserves the new field).

**Residual risk.** `handleHoleFall` teleports via `onPlayerTeleported` and does
*not* run the `onPlayerStepped` callback, so a hole fall does not refresh the
PZ status icon. Accepted: hole destinations lead to caves, never protection
zones. The server-side pz-lock *enforcement* is unaffected — hole falls have no
pz-lock bypass because the destination is validated for walkability/occupancy
and holes never open into PZ tiles. If a PZ-tile hole destination is ever
authored, push a fight-state from `handleHoleFall`.
