# Feature 50 — completed sub-work

Remaining world-action kinds, from
[implementation-feature-50.md](../implementation-feature-50.md). The feature
stays **open**: only the teleport exploit-test box was closed in this pass.
Chests, pressure plates and fields are still not started.

Cross-links: [implementation-feature-50.md](../implementation-feature-50.md) ·
[todo-13.md](../todo-13.md).

---

## 2026-07-25 — Teleport coherence under simultaneous users

**Problem.** The exploit-test matrix for teleports was recorded as half-done:
"state coherent for simultaneous users" was waiting on teleport work.

**What was found.** Step-on teleports already work — `convertOtbm` emits them
as `MapTransition { kind: "teleport", activation: "step" }`, and
`MovementRules` resolves a step onto the source tile to the destination before
the occupancy and walkability checks. The missing piece was not code but the
proof that two players cannot desynchronise the tile.

**What changed.** `server/src/World.test.ts` gains a case where two players
step onto the same teleport tile in the same tick. It pins the whole coherent
outcome: exactly one lands on the destination, the other is refused rather than
stacked, the source tile is left clear, neither player ends up in a half-moved
state, and once the destination clears the second player teleports normally.
The property holds because the transition resolves *before* the occupancy
check, so the destination is the tile that gets contended — not the source.

**Files touched.** `server/src/World.test.ts`.

**Verification.** `vitest run src/World.test.ts` — 42 passed. Full suites:
`vitest run` 963 passed, `test:integration` 203 passed.

**Explicitly not done in this pass.** Repeatable chests, pressure plates and
fields were not started; the dropdown deviations are unresolved. Their plans
are in [implementation-feature-50.md](../implementation-feature-50.md), and
fields are additionally blocked on content — the pinned item catalog imports
`kind: "magicfield"` for 45 types but no `field` payload at all, so there is
nothing to drive damage from yet.
