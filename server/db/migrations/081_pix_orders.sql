create table pix_orders (
  id uuid primary key,
  account_id uuid not null references accounts(id),
  character_id uuid references characters(id) on delete set null,
  package_id varchar(64) not null,
  coins bigint not null check (coins between 1 and 1000000),
  amount_centavos bigint not null check (amount_centavos between 1 and 10000000),
  provider text not null check (provider in ('mercadopago')),
  provider_payment_id text,
  brcode text check (brcode is null or octet_length(brcode) <= 2048),
  status text not null default 'pending' check (
    status in ('pending', 'paid', 'credited', 'cancelled', 'expired', 'refunded')
  ),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz,
  credited_at timestamptz,
  refunded_at timestamptz,
  provider_snapshot jsonb check (
    provider_snapshot is null
    or (jsonb_typeof(provider_snapshot) = 'object'
        and octet_length(provider_snapshot::text) <= 8192)
  )
);

create unique index pix_orders_pending_per_account_idx
  on pix_orders(account_id)
  where status = 'pending';

create unique index pix_orders_provider_payment_idx
  on pix_orders(provider, provider_payment_id)
  where provider_payment_id is not null;

create index pix_orders_open_expires_idx
  on pix_orders(expires_at)
  where status in ('pending', 'paid');

create index pix_orders_account_created_idx
  on pix_orders(account_id, created_at desc);

alter table pix_orders enable row level security;

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
      'reward-expired',
      'reward-collect',
      'daily-reward-claim',
      'quest-reward',
      'imbuement-scroll-create',
      'imbuement-scroll-apply',
      'bless-purchase',
      'portable-seller-sale',
      'pix-order-created',
      'pix-coin-credit',
      'pix-order-cancelled',
      'pix-order-expired',
      'pix-refund'
    )
  );
