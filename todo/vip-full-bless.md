# VIP benefit: Full Bless (blocked)

**Goal:** buying bless from the Inquisition NPC grants a VIP (premium)
character all blessings in one purchase. Advertised on `/vip-account` with a
"coming soon" badge.

**Blocker:** blessing *acquisition* does not exist. The math library is ready
(`server/src/progression/blessings.ts` costs/bitmask,
`getDeathLossPercent.ts` 8%-per-bless reduction) but `Player.blessings` is
hard-coded to `0` ("Nothing grants them yet", `Player.ts`), there is no DB
column, no protocol message, and no NPC bless dialogue action —
`protocol/src/npc.ts` supports only `travel`. Henricus/Inquisition NPCs are
not imported (`content/npcs/canary-npc-import-report.json`).

## Plan

1. Persistence: `blessings` bitmask column on `characters` (migration), load
   at login, wire `Player.blessings` to it; consume/clear on death exactly
   where `getDeathLossPercent` already reads the count.
2. Purchase flow: extend the NPC dialogue action union with a `bless` action
   (`protocol/src/npc.ts`), price from `getBlessingCost(level)` /
   `getPvpBlessingCost`; gold leg + blessing write in one transaction with an
   `audit_log` entry (charter rule 11).
3. Import or hand-place an Inquisition-style NPC (Henricus) selling the five
   regular blessings; temple NPCs can sell singles later.
4. VIP leg: when the buyer `isPremiumAt(now)`, one "bless" purchase grants
   all blessings the NPC sells (price = sum of singles, or Canary's
   discounted full-bless price — decide at implementation).
5. Flip the `fullBless` row in `VipAccountPage.tsx` to `live: true`.
6. Tests: insufficient gold cannot go negative; double-purchase idempotent;
   death consumes blessings once; free account gets only the bless it paid
   for, premium gets all.
