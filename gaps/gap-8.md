# Gap 8: Known client hot paths that current harnesses cannot certify

**Severity:** low-medium (perf opportunities parked for lack of measurement)
**Verified:** 2026-08-05 — both were implemented, measured with
`monsterPerformance.e2e` (2 runs per side), and reverted because the delta was
inside the noise band. The code-level waste is real; the probe just never
exercises it.

## 1. Combat-log lines re-localize all chat history

`components/game-window/GameHudOverlay.tsx` builds `chatChannels` in one
`useMemo` keyed on `[chatState.channels, combatLog, t]`. Every combat-log line
re-runs `toChatMessage` over every entry of every conversation channel and
rebuilds all channel objects, defeating `ChatPanel`'s memo. The e2e probe only
produces a handful of combat lines in its 8-second combat window, so the fix
was unmeasurable there. In sustained hunts (multiple hits/second, 200-line
system log, open channels) this is real per-frame work.

**Fix sketch (already validated, revert-safe):** split into three memos —
conversation channels on `[chatState.channels, t]`, system channel on
`[combatLog, t]`, concatenation on both. `lib/chat/toChatMessage.test.ts`
(added 2026-08-05) locks the mapping.

## 2. Creature-viewer visibility checks bypass the first-visible-floor cache

~13 call sites (MonsterBrain targeting, Combat, PlayerAutoAttack,
resolveSpellTarget, …) call `world.canSee(creature.position, target, range)`,
which recomputes `getFirstVisibleFloor` (~70 `map.getTile` calls at z=7) per
call, instead of `world.canCreatureSee(creature, …)` which caches per creature
by position revision. With one player online this is ~0.03 ms/tick (why the
load probe showed nothing); with many players near many hostile monsters the
per-candidate cost multiplies.

**Fix sketch:** mechanical receiver swap at those sites;
`World.test.ts › canCreatureSee cache equivalence` (added 2026-08-05) proves
the two paths agree. Land it together with the combined players+monsters
harness from gap-6 so the win is demonstrable.
