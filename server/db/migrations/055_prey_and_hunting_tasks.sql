-- Prey (Feature 74) and hunting tasks (Feature 75), transcribed from pinned
-- Canary ioprey.cpp.
--
-- Three tables:
--
--   * character_prey_resources — the shared wildcard balance and the hunting
--     task point balance. Both are debited/credited only through conditional
--     UPDATEs (balance >= amount) inside the same transaction as the slot
--     mutation they pay for, so racing spends leave exactly one winner.
--
--   * character_prey_slots / character_task_slots — one row per slot, the
--     durable copy of the in-memory slot state. Gold-charging mutations
--     (list rerolls, task cancel) and point-granting mutations (task claim)
--     are single transactions with the bank/ledger/audit rows; everything
--     else persists write-behind.
--
-- Timestamps (free_reroll_at, disabled_until) are epoch milliseconds from
-- the server clock: comparisons happen against the server's own now, never a
-- client value, and a restart cannot shorten them.

create table character_prey_resources (
  character_id uuid primary key references characters(id) on delete cascade,
  wildcards bigint not null default 0 check (wildcards >= 0),
  task_points bigint not null default 0 check (task_points >= 0)
);

alter table character_prey_resources enable row level security;

create table character_prey_slots (
  character_id uuid not null references characters(id) on delete cascade,
  slot smallint not null check (slot between 0 and 2),
  state text not null check (
    state in (
      'locked',
      'inactive',
      'active',
      'selection',
      'selection-change-monster',
      'list-selection'
    )
  ),
  grid integer[] not null default '{}' check (cardinality(grid) <= 9),
  selected_race_id integer check (selected_race_id > 0),
  bonus_type text check (
    bonus_type in ('damage', 'defense', 'experience', 'loot')
  ),
  bonus_rarity smallint not null default 1 check (bonus_rarity between 1 and 10),
  bonus_percentage smallint not null default 5 check (bonus_percentage between 1 and 100),
  bonus_time_left integer not null default 0 check (bonus_time_left between 0 and 7200),
  free_reroll_at bigint not null default 0 check (free_reroll_at >= 0),
  reroll_option text not null default 'none' check (
    reroll_option in ('none', 'auto-reroll', 'lock')
  ),
  primary key (character_id, slot)
);

alter table character_prey_slots enable row level security;

create table character_task_slots (
  character_id uuid not null references characters(id) on delete cascade,
  slot smallint not null check (slot between 0 and 2),
  state text not null check (
    state in (
      'locked',
      'inactive',
      'selection',
      'list-selection',
      'active',
      'completed'
    )
  ),
  grid integer[] not null default '{}' check (cardinality(grid) <= 9),
  selected_race_id integer check (selected_race_id > 0),
  upgrade boolean not null default false,
  rarity smallint not null default 1 check (rarity between 1 and 5),
  kills integer not null default 0 check (kills >= 0),
  disabled_until bigint not null default 0 check (disabled_until >= 0),
  free_reroll_at bigint not null default 0 check (free_reroll_at >= 0),
  primary key (character_id, slot)
);

alter table character_task_slots enable row level security;

alter table bank_ledger
  drop constraint bank_ledger_entry_type_check,
  add constraint bank_ledger_entry_type_check check (
    entry_type in (
      'deposit',
      'withdraw',
      'transfer-in',
      'transfer-out',
      'shop-purchase',
      'shop-sale',
      'npc-travel',
      'market-fee',
      'market-escrow',
      'market-refund',
      'market-sale',
      'market-purchase',
      'house-purchase',
      'house-rent',
      'house-transfer-in',
      'house-transfer-out',
      'house-bid-escrow',
      'house-bid-refund',
      'gem-atelier',
      'vocation-promotion',
      'spell-purchase',
      'guild-deposit',
      'guild-withdraw',
      'prey-reroll',
      'hunting-task-reroll',
      'hunting-task-cancel'
    )
  );

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
      'hunting-task-claim'
    )
  );
