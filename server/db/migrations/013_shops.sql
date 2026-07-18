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
      'shop-sale'
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
      'shop-purchase'
    )
  );

create table shop_stock (
  shop_id varchar(64) not null,
  offer_id varchar(64) not null,
  initial_stock integer not null check (initial_stock between 1 and 1000000000),
  remaining_stock integer not null check (
    remaining_stock between 0 and initial_stock
  ),
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now(),
  primary key (shop_id, offer_id)
);

alter table shop_stock enable row level security;
