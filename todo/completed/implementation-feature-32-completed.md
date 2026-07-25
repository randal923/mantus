# Feature 32 — progress log

Cross-links: [todo-9.md](../todo-9.md) · [implementation](../implementation-feature-32.md).

This feature is **still open** — blessings (purchase/state) and item loss into a
player corpse remain, both waiting on Feature 72. This log records the
sub-work that is finished.

---

## 2026-07-25 — Canary loss formula, skill/magic loss, unfair-fight reduction

**Problem.** The shipped penalty was an explicit stand-in: a flat 10% of total
experience, nothing else. Canary charges the same fraction against experience,
magic level, *and* every skill, derives that fraction from level, promotion,
and blessings, and scales the whole thing by an unfair-fight reduction when the
victim was ganged.

**What changed.**

- **`server/src/progression/getDeathLossPercent.ts`** (new) expresses the
  penalty as typed data rather than per-vocation branches: Canary's
  `Player::getLostPercent()` — the flat 10% below level 25, the
  `((level + 50) * 50 * (level² − 5·level + 8)) / experience` curve from 25 up
  (using `levelPercent` for the fractional level, as Canary does), −30% when
  promoted, −8% per blessing — multiplied by the unfair-fight reduction. Every
  input is bounds-checked; it refuses rather than guessing. It replaces
  `getDeathExperienceLoss.ts`, which is deleted.
- **`CharacterProgression.applyDeathLoss`** applies all three losses under one
  event id, mirroring `Player::death`: experience first, then magic (draining
  the mana spent toward the current level before dropping a level), then each
  skill (draining tries, never below the starting level of 10). Because the
  whole penalty is one recorded event, a reconnect that replays the death
  charges nothing a second time — extended from the existing experience-only
  invariant.
- **`Player.applyDeathPenalty(eventId, { unfairFightReduction })`** computes
  the fraction from live state at execution time and reports what each leg
  cost. `Player.blessings` is the seam for Feature 72 and reads 0 today.
- **Unfair fight.** `PvpHooks.unfairFightReduction(victim, now)` (implemented
  in `PvpTracker`) sums the levels of every *other player* still inside the
  victim's in-fight window from the damage attribution the tracker already
  keeps, and returns `max(20, round(level / summedLevels × 100))` — 100 when
  the fight was fair or the killer was a monster. `DeathHandler` measures it
  before death cleanup wipes the aggression state and feeds it to the penalty.
- The victim now sees what each leg cost (`You lost N sword levels.`).

**Files touched.**

- `server/src/progression/getDeathLossPercent.ts` (new),
  `getDeathExperienceLoss.ts` (deleted),
  `server/src/progression/CharacterProgression.ts`, `server/src/Player.ts`
- `server/src/pvp/PvpHooks.ts`, `server/src/pvp/PvpTracker.ts`,
  `server/src/combat/DeathHandler.ts`
- Tests: `getDeathLossPercent.test.ts` (new), `deathPenalty.test.ts` (new),
  `PvpTracker.test.ts`, `CharacterProgression.test.ts`

**Verification.** `yarn workspace server test` — 872 passed / 183 skipped, up
12 tests. New coverage: the loss curve and every discount (flat tenth below 25,
the level-100 curve value, promotion, per-blessing, unfair-fight scaling,
out-of-range refusals); one death charging experience + magic + skills; a
replayed death event charging no leg twice; a fresh character losing nothing
and no skill dropping below 10; a ganged victim paying less than a fair fight;
and the tracker's reduction (fair fight → 100, gang → the 20% floor, attackers
outside the in-fight window ignored, monster death → 100).

**Residual risk / still open.**

- **Blessings are always 0.** The formula and `Player.blessings` are the seam;
  purchase, persistence, and consumption belong to Feature 72 (bank payment
  and Quentin's dialogue already exist as informational-only).
- **No item loss into a player corpse.** Still not implemented, and it is the
  leg that needs a new atomic item operation (equipment + backpack moving into
  a fresh player corpse in the same transaction as the penalty snapshot, with
  audits). Blessing state gates it, so it follows Feature 72.
- The level-25 threshold constant and the flat 10% below it are pinned from
  Canary's `Player::getLostPercent`; re-verify them if the pinned Canary
  commit moves.
