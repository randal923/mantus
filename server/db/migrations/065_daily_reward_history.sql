-- Feature 84: the reward wall's History panel. Canary keeps the last 15
-- claims per player in `daily_reward_history` and sends them as prebuilt
-- sentences (daily_reward.lua:209-233); mantus stores the claim's parts
-- instead — day, kind, allowance and the picked items — so the window can
-- render each entry in the player's own language. The row is written inside
-- the claim transaction, next to the `daily-reward-claim` audit row, so a
-- history entry can never exist for a claim that rolled back.

create table character_daily_reward_history (
  id bigserial primary key,
  character_id uuid not null references characters(id) on delete cascade,
  reward_day smallint not null check (reward_day between 1 and 7),
  kind varchar(20) not null check (
    kind in ('vocation-items', 'wildcards', 'training-items', 'xp-boost')
  ),
  -- Item units, prey wildcards or boost minutes the claim paid.
  allowance integer not null check (allowance >= 0),
  -- [{ "typeId": n, "count": n }]; empty for wildcard and boost days.
  items jsonb not null default '[]'::jsonb check (
    jsonb_typeof(items) = 'array'
  ),
  claimed_at timestamptz not null default now()
);

create index character_daily_reward_history_character_claimed_idx
  on character_daily_reward_history(character_id, claimed_at desc, id desc);

alter table character_daily_reward_history enable row level security;
