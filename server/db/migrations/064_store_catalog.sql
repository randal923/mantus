-- Mantus Store catalog parity (Feature 43): Canary's offer types.
--
-- Two things the widened catalog needs that no table carried yet:
--
--   * `character_store_limits` — the per-character purchase counters Canary
--     keeps in player KV. Today that is only the XP boost, which Canary caps
--     at 6 buys per day on an escalating price curve. The counter has to be
--     server-side state (charter rule 8) and it has to be read and written
--     inside the purchase transaction, so it is a row, not a cache.
--
--   * a replay guard for `tools/grantCoins.mjs`'s gold leg. The Mantus Coin
--     leg already has one (`mantus_coin_ledger.request_key`); gold had none,
--     so re-running the same grant key credited twice. The partial unique
--     index makes "one gold grant per key" a database invariant. It only
--     covers rows that carry a `grantKey`, so the game's own bank deposits
--     are unaffected.

create table character_store_limits (
  character_id uuid primary key references characters(id) on delete cascade,
  -- Server-local calendar day the counter below belongs to; a purchase on a
  -- later day resets it rather than carrying yesterday's count forward.
  exp_boost_day date,
  exp_boost_count smallint not null default 0
    check (exp_boost_count between 0 and 6),
  updated_at timestamptz not null default now()
);

alter table character_store_limits enable row level security;

create unique index audit_log_bank_deposit_grant_key_idx
  on audit_log ((details ->> 'grantKey'))
  where event_type = 'bank-deposit' and details ? 'grantKey';
