# VIP benefit: House Absence (blocked as specified)

**Goal:** VIP players can stay offline 10 days without losing their house,
versus 7 for free players. Advertised on `/vip-account` with a "coming soon"
badge.

**Blocker:** there is no offline-absence eviction rule to relax. Houses are
fully implemented (`server/src/house/HouseService.ts`, rent scan, eviction
after `maxWarnings` missed 30-day rent charges) but nothing evicts for being
offline; no absence column or check exists.

**Design caution:** shipping this means introducing a *new punitive rule* for
free players (lose the house after 7 days offline) so that premium can relax
it to 10. That is a game-design decision, not just a perk. Also note houses
already require premium to bid/own at all (`premium-required` in
`HouseService`), which arguably supersedes this benefit — a cheaper
alternative reading is "your house survives a premium lapse for N days",
which today is governed by the rent cycle only.

## Plan if adopted

1. Add owner-absence tracking to the rent scan: the owner's `last_seen_at`
   (already maintained for stamina, Feature 18) joined into the house scan
   query — no new column needed.
2. Rule: absence > 7 days (free) / 10 days (premium, checked against
   `premium_until` at scan time) → eviction via the existing
   `applyEviction` path (items mailed to inbox, auction re-listed), with an
   `audit_log` entry.
3. Constants in `protocol/src/house.ts` (`absenceEvictionDays`,
   `premiumAbsenceEvictionDays`) so `/vip-account` renders them.
4. Warning mail at day 5 (in-game inbox letter), like rent warnings.
5. Tests: absence boundary at exactly 7/10 days, premium lapse mid-absence
   uses the tier at scan time, eviction writes the audit row.
