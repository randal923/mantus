-- Owner-absence eviction (VIP benefit: 7 days offline for free accounts,
-- 10 for premium). Stores the characters.last_seen_at value the warning
-- letter was mailed for, so each absence episode warns exactly once and a
-- fresh login (which advances last_seen_at) re-arms the warning.
alter table houses
  add column absence_warned_for timestamptz;
