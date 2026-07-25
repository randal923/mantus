-- Guild balance, war payment stakes, and guild points (todo 15, Feature 58).
--
-- The balance lives on `guilds` so every mutation can lock exactly one row,
-- which is what makes racing withdrawals serialize instead of both reading the
-- same balance. It can never go negative: the debit is a conditional UPDATE
-- guarded by `balance >= amount`, so a losing racer updates nothing.
--
-- `guild_wars.payment` is Canary's war stake. It is escrowed out of both
-- guilds' balances in the same transaction that activates the war
-- (`escrowed_payment` records what was actually taken) and paid to the winner
-- inside the existing exactly-once end-war transaction. `payout_settled`
-- is the idempotency guard: the payout UPDATE requires it to be false, so a
-- retried or concurrent end-war pays out at most once.
alter table guilds
  add column balance bigint not null default 0 check (balance >= 0),
  add column points bigint not null default 0 check (points >= 0),
  add column level integer not null default 1 check (level between 1 and 1000);

alter table guild_wars
  add column payment bigint not null default 0 check (payment >= 0),
  add column escrowed_payment bigint not null default 0
    check (escrowed_payment >= 0),
  add column payout_settled boolean not null default false;

create table guild_bank_ledger (
  id bigserial primary key,
  guild_id uuid not null references guilds(id) on delete cascade,
  character_id uuid references characters(id) on delete set null,
  entry_type text not null check (
    entry_type in (
      'deposit',
      'withdraw',
      'war-stake',
      'war-payout',
      'war-refund'
    )
  ),
  amount bigint not null check (amount > 0),
  balance_after bigint not null check (balance_after >= 0),
  occurred_at timestamptz not null default now()
);

create index guild_bank_ledger_guild_id_occurred_at_idx
  on guild_bank_ledger(guild_id, occurred_at desc);

alter table guild_bank_ledger enable row level security;

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
      'gem-atelier',
      'vocation-promotion',
      'spell-purchase',
      'guild-deposit',
      'guild-withdraw'
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
      'guild-war-payout'
    )
  );
