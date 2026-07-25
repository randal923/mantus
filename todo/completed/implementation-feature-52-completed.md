# Feature 52 — completed sub-work

Registry-wide execution guarantees and flag parsing, from
[implementation-feature-52.md](../implementation-feature-52.md). The feature
stays **open**: the asset-flag parsing and the deferred look/ctrl-menu UX are
untouched.

Cross-links: [implementation-feature-52.md](../implementation-feature-52.md) ·
[todo-13.md](../todo-13.md).

---

## 2026-07-25 — Shared precondition table and the write-map path

**Problem.** Each handler satisfied the execution-time guarantees on its own, so
nothing stopped a new one from skipping a re-check. Map items were also
read-only: blackboards and tombstones had no write path.

**What changed.**

*Preconditions.* `worldActionPreconditions.ts` holds
`WORLD_ACTION_REQUIREMENTS`, a table exhaustive over every dispatchable kind
(reach, item-still-placed, house access, exclusivity), plus
`checkWorldActionPreconditions` which runs all of them against live state.
`WorldActionRegistry` calls it before dispatch, so a handler cannot skip a
check — and because the table is typed `Record<RegisteredKind, …>`, a new kind
cannot compile without declaring its requirements. `handleDoorUse` lost its
private house-access check, which the shared table now owns for every kind.

*Write-map.* New bounded `write-map-item` intent in `protocol/` (128-char
instance id + 3997-char text, inside the shared 4 KiB cap; rate-bounded by the
200 ms use exhaust), `planWriteMapItem` (materialize-on-first-mutation +
expected-version guard + `written` audit, exactly like `planTransformMapItem`),
and `handleMapWrite` behind the same precondition table. `handleSignRead` now
reports the type's real `writeable` flag and the tile position, so the existing
`ItemTextModal` opens in edit mode and the client sends `write-map-item` for map
items and `write-item` for carried ones.

**Files touched.**
`server/src/action/{worldActionPreconditions,handleMapWrite,WorldAction,WorldActionRegistry,handleDoorUse,handleSignRead}.ts`,
`server/src/item/plan/planWriteMapItem.ts`,
`protocol/src/{clientMessages,serverMessages}.ts`, `server/src/GameServer.ts`,
`client/lib/net/GameClient.ts`,
`client/components/game-window/ItemTextOverlay.tsx`.

**How it was verified.** `worldActionPreconditions.test.ts` (9 cases, including
one that fails if a kind is added without requirements and one that pins every
mutating kind as exclusive/item-checked/house-checked) and six write-map cases
in `WorldActionRegistry.test.ts`: one materialized row, two racing writers
leaving one coherent text, oversized text refused, out-of-reach refused, a
forged instance id refused, and a read-only item refused.

**Residual risk.** The asset-flag parsing (`m_transformOnUse`, `ignoreLook`) and
the mutable-item promotion still need a full asset regeneration; see the feature
file.
