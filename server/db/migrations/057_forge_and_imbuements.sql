-- Exaltation Forge and imbuements (Feature 78), transcribed from pinned
-- Canary schema.sql:313-328 (forge_history) and player.cpp.
--
--   * character_forge_resources — dust balance and the dust cap. Debits are
--     conditional UPDATEs (dusts >= amount) inside the same transaction as
--     the conversion/fusion they pay for; kill-credit dust is clamped to
--     the cap in SQL so racing kills cannot overfill.
--
--   * forge_history — one row per forge action, written in the same
--     transaction as the action itself, one-to-one with its audit row.
--
-- Item tiers and imbuement slot states live on items.attributes (jsonb);
-- slivers and cores are ordinary carried items (37109/37110).

create table character_forge_resources (
  character_id uuid primary key references characters(id) on delete cascade,
  dusts integer not null default 0 check (dusts >= 0),
  dust_level integer not null default 100 check (dust_level between 100 and 225),
  check (dusts <= dust_level)
);

alter table character_forge_resources enable row level security;

create table forge_history (
  id bigserial primary key,
  character_id uuid not null references characters(id) on delete cascade,
  action text not null check (
    action in (
      'fusion', 'transfer', 'dust-to-slivers', 'slivers-to-cores',
      'increase-dust-limit'
    )
  ),
  convergence boolean not null default false,
  success boolean not null default true,
  bonus smallint not null default 0 check (bonus between 0 and 8),
  tier smallint not null default 0 check (tier between 0 and 10),
  description text not null default '' check (char_length(description) <= 300),
  cost_gold bigint not null default 0 check (cost_gold >= 0),
  cost_dust integer not null default 0 check (cost_dust >= 0),
  cost_cores integer not null default 0 check (cost_cores >= 0),
  gained bigint not null default 0 check (gained >= 0),
  created_at timestamptz not null default now()
);

create index forge_history_character_created_idx
  on forge_history(character_id, created_at desc, id desc);

alter table forge_history enable row level security;

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
      'boss-slot-remove',
      'forge',
      'imbuement'
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
      'boss-slot-remove',
      'forge-fusion',
      'forge-transfer',
      'forge-conversion',
      'imbuement-apply',
      'imbuement-clear'
    )
  );
