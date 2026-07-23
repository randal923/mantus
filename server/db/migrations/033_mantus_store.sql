alter table accounts
  add column if not exists mantus_coins bigint not null default 0
    check (mantus_coins between 0 and 1000000000000);

create table if not exists mantus_coin_ledger (
  id bigserial primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  entry_type text not null check (
    entry_type in ('grant', 'purchase', 'refund')
  ),
  amount bigint not null check (amount <> 0),
  balance_after bigint not null check (
    balance_after between 0 and 1000000000000
  ),
  offer_id varchar(64),
  occurred_at timestamptz not null default now()
);

create index if not exists mantus_coin_ledger_account_id_occurred_at_idx
  on mantus_coin_ledger(account_id, occurred_at desc);

alter table mantus_coin_ledger enable row level security;

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
      'gem-reveal',
      'gem-destroy',
      'gem-switch-domain',
      'gem-grade-improve',
      'vocation-promotion',
      'store-purchase'
    )
  );
