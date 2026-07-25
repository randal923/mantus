# Feature 72 — completed sub-work

Feature 72 (beds, sleep, stamina, training, blessings, regeneration) is part of
[Todo 16 — Remaining Canary systems and client polish](../todo-16.md). It
remains **open**. Cross-links:
[implementation-feature-72.md](../implementation-feature-72.md) ·
[todo-16.md](../todo-16.md).

---

## 2026-07-25 — Blessing catalog, cost curves, and two death-formula parity bugs

**Problem.** Blessings were a seam and nothing more: `Player.blessings` was a
getter returning a literal `0`, recorded in [`TODO.md`](../../TODO.md) as
"Blessings are always zero". Feature 32 (death penalty) and Feature 60
(blessing-loss extras) both wait on it. The blessing tables were also not in
`content/` — they live in Canary Lua and C++ that no importer converts — so
there was no pinned data to build against.

**What changed.**

- Fetched the pinned Canary baseline (`a879c931`) per the documented blobless
  clone, and transcribed the blessing data from
  `data/libs/systems/blessing.lua` and `src/creatures/players/player.cpp` into
  `server/src/progression/blessings.ts` as typed data. No Lua is executed and
  nothing new is a runtime dependency.
  - All eight blessings with ids, names, kinds (pvp / regular / enhanced) and
    charm item ids.
  - `getBlessingCost(level, enhanced)` and `getPvpBlessingCost(level)` —
    Canary's two distinct curves, including the enhanced blessings' higher base
    and slope above level 120 and the PVP curve's flat 50,000 cap above 270.
  - `equipmentLossChancePercent()` from `Blessings.LossPercent` plus
    `calculateEquipmentLoss`'s container/non-container split.
  - The persisted representation is Canary's bitmask, with
    `lossReducingBlessingCount()` implementing the detail that matters most:
    **`getLostPercent` iterates ids 2..8**, so Twist of Fate never discounts
    the death penalty and the effective count caps at 7, not 8.

- **Two parity bugs in the already-shipped Feature 32 death formula**, both
  found by reading the real source rather than inferring it:
  1. `getDeathLossPercent` branched onto the curve at `level >= 25`; Canary
     branches at `level >= 24`. A level-24 character was charged the flat 10%
     instead of the curve.
  2. The low-level branch dropped Canary's clamp entirely: below the curve
     threshold, a blessing reduction that already reaches 40% is rounded **up**
     to 50% before promotion is added. A low-level character with five or more
     blessings was being over-charged. Ordering matters and is now explicit —
     the clamp applies to the blessing discount only, then promotion is added,
     so promotion is never swallowed by it.

**Files touched.** New: `server/src/progression/blessings.ts`,
`server/src/progression/blessings.test.ts`. Modified:
`server/src/progression/getDeathLossPercent.ts`,
`server/src/progression/getDeathLossPercent.test.ts`.

**Verification.** `yarn workspace server test` → 1,146 passed (was 1,135; +8
blessing cases and +3 death-formula cases). `yarn typecheck` clean. Every cost
and loss-chance assertion is a transcribed value from the pinned source, not a
derived expectation, so the tests fail if the transcription drifts.

**Residual risk / remaining work (keeps the feature open).**
- **Nothing grants or persists a blessing yet.** `Player.blessings` still
  returns 0 — the pure layer is complete and tested but not wired. The next
  slice is the `characters.blessings` bitmask column, `CharacterStore`
  load/save, and `Player.blessings` reading
  `lossReducingBlessingCount(mask)`.
- **No purchase path.** Canary buys blessings with `removeMoneyBank` (carried
  gold, then bank), which makes this economy-relevant: it must be one ACID
  transaction with a ledger + audit row, and per `AGENTS.md` it must not share
  a PR with another economy system. `Blessings.BuyAllBlesses` also refuses
  while pz-locked outside a protection zone — that check belongs at execution
  time in the tick.
- **Blessing consumption on death is not implemented**, so
  `equipmentLossChancePercent` has no caller yet. That is Feature 32's item
  drop into a player corpse, which also needs the amulet-of-loss and
  red/black-skull branches from `Blessings.PlayerDeath`.
- The other halves of Feature 72 — beds/sleep, the offline-training statue and
  bar column, the exercise-weapon/dummy loop — are untouched. Their conversion
  engines already exist (Feature 18); only the in-world triggers are missing.
