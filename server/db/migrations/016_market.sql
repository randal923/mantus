alter table items
  drop constraint items_location_slot_bounds,
  add constraint items_location_slot_bounds check (
    (location_type = 'depot' and slot_index between 0 and 1999)
    or (location_type = 'inbox' and slot_index between 0 and 1999)
    or (location_type = 'market-escrow' and slot_index between 0 and 1999)
    or (location_type in (
      'inventory', 'trade-reservation', 'container', 'corpse'
    ) and slot_index between 0 and 99)
    or (location_type in ('equipment', 'world', 'house') and slot_index is null)
  );

create table market_offers (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references characters(id) on delete restrict,
  account_id uuid not null references accounts(id) on delete restrict,
  side text not null check (side in ('buy', 'sell')),
  item_type_id integer not null check (item_type_id between 1 and 65535),
  amount integer not null check (amount between 1 and 64000),
  remaining_amount integer not null check (remaining_amount between 1 and 64000),
  unit_price bigint not null check (unit_price between 1 and 1000000000000),
  fee_paid bigint not null check (fee_paid between 0 and 1000000),
  escrow_balance bigint not null default 0 check (escrow_balance >= 0),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  check (remaining_amount <= amount),
  check (amount::numeric * unit_price::numeric <= 1000000000000),
  check (side = 'buy' or escrow_balance = 0),
  check (side = 'sell' or escrow_balance = remaining_amount::bigint * unit_price)
);

create index market_offers_item_side_price_idx
  on market_offers(item_type_id, side, unit_price);
create index market_offers_character_id_idx on market_offers(character_id);
create index market_offers_expires_at_idx on market_offers(expires_at);

alter table market_offers enable row level security;

create table market_escrow_items (
  item_id uuid primary key references items(id) on delete restrict,
  offer_id uuid not null references market_offers(id) on delete restrict
);

create index market_escrow_items_offer_id_idx
  on market_escrow_items(offer_id);

alter table market_escrow_items enable row level security;

create table market_history (
  id bigserial primary key,
  offer_id uuid not null,
  character_id uuid references characters(id) on delete set null,
  role text not null check (role in ('creator', 'acceptor')),
  side text not null check (side in ('buy', 'sell')),
  item_type_id integer not null check (item_type_id between 1 and 65535),
  amount integer not null check (amount between 1 and 64000),
  unit_price bigint not null check (unit_price between 1 and 1000000000000),
  state text not null check (state in ('accepted', 'cancelled', 'expired')),
  occurred_at timestamptz not null default now()
);

create index market_history_character_id_occurred_at_idx
  on market_history(character_id, occurred_at desc);
create index market_history_stats_idx
  on market_history(item_type_id)
  where state = 'accepted' and role = 'creator';

alter table market_history enable row level security;

create table market_requests (
  request_id uuid primary key,
  character_id uuid not null references characters(id) on delete cascade,
  kind text not null check (kind in ('create', 'accept', 'cancel')),
  created_at timestamptz not null default now()
);

alter table market_requests enable row level security;

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
      'market-offer-expired'
    )
  );

alter table bank_ledger
  drop constraint bank_ledger_entry_type_check,
  add constraint bank_ledger_entry_type_check check (
    entry_type in (
      'deposit',
      'withdraw',
      'transfer-in',
      'transfer-out',
      'shop-purchase',
      'market-fee',
      'market-escrow',
      'market-refund',
      'market-sale',
      'market-purchase'
    )
  );
