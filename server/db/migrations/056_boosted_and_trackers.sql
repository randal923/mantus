-- Boosted creatures/bosses, kill trackers, and bosstiary boss slots
-- (Feature 76), transcribed from pinned Canary game.cpp:770-844 and
-- io_bosstiary.cpp.
--
--   * boosted_daily — one row per calendar day; the row IS the selection, so
--     racing processes insert-or-read the same pair (exactly-once via the
--     primary key). Day boundaries use the server clock only.
--
--   * character_monster_trackers — the cyclopedia kill-tracker lists, one
--     row per tracked race, capped at 255 per scope in the service.
--
--   * character_boss_slots — the two bosstiary boss slots plus the removal
--     counter that prices future removals. Removal gold is a bank debit in
--     the same transaction as the slot clear (ledger + audit rows).

create table boosted_daily (
  day date primary key,
  creature_race_id integer not null check (creature_race_id > 0),
  creature_name varchar(100) not null,
  boss_race_id integer check (boss_race_id > 0),
  boss_name varchar(100),
  created_at timestamptz not null default now()
);

alter table boosted_daily enable row level security;

create table character_monster_trackers (
  character_id uuid not null references characters(id) on delete cascade,
  scope text not null check (scope in ('bestiary', 'bosstiary')),
  race_id integer not null check (race_id > 0),
  created_at timestamptz not null default now(),
  primary key (character_id, scope, race_id)
);

alter table character_monster_trackers enable row level security;

create table character_boss_slots (
  character_id uuid primary key references characters(id) on delete cascade,
  slot_one_race_id integer check (slot_one_race_id > 0),
  slot_two_race_id integer check (slot_two_race_id > 0),
  remove_count integer not null default 0 check (remove_count >= 0)
);

alter table character_boss_slots enable row level security;

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
      'hunting-task-cancel',
      'boss-slot-remove'
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
      'hunting-task-claim',
      'boss-slot-remove'
    )
  );
