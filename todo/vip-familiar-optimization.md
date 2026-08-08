# VIP benefit: Familiar Optimization (blocked)

**Goal:** familiars deal 30% more damage with their spells on VIP (premium)
accounts. Advertised on `/vip-account` with a "coming soon" badge.

**Blocker:** familiars do not exist (Feature 85, `todo/status.md` ❌/❌). The
five vocation familiar spells sit unimplemented in
`content/spells/canary-spells.json`; there is no familiar monster type, no
master/summon damage scaling, and no familiar runtime in `server/src`.

## Plan once familiars ship

1. Build familiars first (Feature 85): summon spell per vocation
   (`utevo gran res ...`), a familiar creature bound to its master's session,
   despawn on logout/death, 15-minute duration + cooldown storage like
   Canary's `familiar.cpp`.
2. The familiar's spell damage pipeline must flow through the server damage
   resolver with the master resolved (`DamageResolver`), not monster AI
   damage, so account tier is visible at execution time.
3. Apply the bonus where the familiar's spell damage is computed: multiply by
   `1.3` when `master.isPremiumAt(now)`. Add the constant to
   `PREMIUM_BENEFITS` in `protocol/src/premiumBenefits.ts`
   (e.g. `familiarDamageMultiplier: 1.3`) so the landing page renders the
   real number.
4. Flip the `familiar` row in `client/components/public-site/VipAccountPage.tsx`
   from `live: false` to `live: true`.
5. Regression test: identical familiar cast, free vs premium master, 30%
   delta; premium lapse mid-summon drops the bonus on the next cast.
