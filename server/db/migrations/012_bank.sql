create table bank_accounts (
  character_id uuid primary key references characters(id) on delete restrict,
  balance bigint not null default 0 check (
    balance between 0 and 1000000000000000
  ),
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

alter table bank_accounts enable row level security;

create table bank_ledger (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  character_id uuid references characters(id) on delete set null,
  entry_type text not null check (
    entry_type in ('deposit', 'withdraw', 'transfer-in', 'transfer-out')
  ),
  amount bigint not null check (amount > 0),
  balance_after bigint not null check (balance_after >= 0),
  counterparty_character_id uuid references characters(id) on delete set null
);

create index bank_ledger_character_id_occurred_at_idx
  on bank_ledger(character_id, occurred_at desc);

alter table bank_ledger enable row level security;

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
      'bank-transfer'
    )
  );
