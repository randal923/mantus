-- Feature 84: daily rewards. One row per character carries the whole streak
-- state; the claim transaction locks it, so two concurrent claims of the
-- same day leave exactly one grant. The day boundary is the server-local
-- calendar day (mantus has no global server save); the XP boost lives here
-- as a plain deadline read by the kill-experience path.

create table character_daily_rewards (
  character_id uuid primary key references characters(id) on delete cascade,
  streak_position smallint not null default 0
    check (streak_position between 0 and 6),
  streak_level integer not null default 0 check (streak_level >= 0),
  joker_tokens smallint not null default 0
    check (joker_tokens between 0 and 3),
  last_claim_day date,
  -- YYYY-MM of the last monthly joker grant.
  last_joker_month varchar(7),
  xp_boost_until_ms bigint not null default 0 check (xp_boost_until_ms >= 0),
  updated_at timestamptz not null default now()
);

alter table character_daily_rewards enable row level security;

alter table audit_log
  drop constraint audit_log_event_type_check,
  add constraint audit_log_event_type_check check (
    event_type in (
      'item-created',
      'item-destroyed',
      'item-transferred',
      'item-split',
      'item-merged',
      'item-transformed',
      'item-written',
      'world-item-seeded',
      'npc-travel',
      'bank-deposit',
      'bank-withdraw',
      'bank-transfer',
      'shop-purchase',
      'shop-sale',
      'market-offer-created',
      'market-offer-accepted',
      'market-offer-cancelled',
      'market-offer-expired',
      'pvp-skull-sanction',
      'house-purchase',
      'house-transfer',
      'house-rent',
      'house-eviction',
      'house-auction-bid',
      'house-auction-settled',
      'gem-reveal',
      'gem-destroy',
      'gem-switch-domain',
      'gem-grade-improve',
      'vocation-promotion',
      'spell-purchase',
      'store-purchase',
      'store-grant',
      'store-refund',
      'chest-loot',
      'world-event-started',
      'world-event-operator',
      'guild-deposit',
      'guild-withdraw',
      'guild-war-stake',
      'guild-war-payout',
      'prey-list-reroll',
      'prey-bonus-reroll',
      'prey-wildcard-list',
      'prey-option-charge',
      'prey-wildcard-grant',
      'hunting-task-reroll',
      'hunting-task-star-reroll',
      'hunting-task-wildcard-list',
      'hunting-task-cancel',
      'hunting-task-claim',
      'boss-slot-remove',
      'forge-fusion',
      'forge-transfer',
      'forge-conversion',
      'imbuement-apply',
      'imbuement-clear',
      'boss-reward',
      'reward-collect',
      'reward-expired',
      'daily-reward-claim'
    )
  );
