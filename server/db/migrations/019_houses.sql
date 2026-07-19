-- Houses (todo 14d): dynamic ownership/rent state and access lists. Static
-- house metadata (name, rent, size, town, entry, tiles) ships in the
-- versioned content artifact server/data/houses.json; a row exists here only
-- while a house is owned. paid_until doubles as the durable, idempotent rent
-- schedule: the rent scheduler scans it and every charge is guarded on the
-- row's current state inside one serializable transaction, so restarts and
-- replays cannot double-charge.

create table houses (
  house_id integer primary key check (house_id between 1 and 1000000),
  owner_character_id uuid not null references characters(id) on delete cascade,
  -- One ownership period; regenerated on transfer. Eviction delivery keys
  -- embed it so item delivery is exactly-once per tenancy.
  tenancy_id uuid not null default gen_random_uuid(),
  purchased_at timestamptz not null default now(),
  paid_until timestamptz not null,
  rent_warnings integer not null default 0 check (rent_warnings between 0 and 7),
  last_rent_charge_at timestamptz,
  updated_at timestamptz not null default now()
);

-- One house per character, enforced by the database against racing buyers.
create unique index houses_owner_character_id_idx on houses(owner_character_id);
create index houses_paid_until_idx on houses(paid_until);

alter table houses enable row level security;

-- kind: 0 guest, 1 subowner. Door-specific lists are deferred.
create table house_access (
  house_id integer not null references houses(house_id) on delete cascade,
  kind smallint not null check (kind in (0, 1)),
  character_id uuid not null references characters(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (house_id, kind, character_id)
);

create index house_access_character_id_idx on house_access(character_id);

alter table house_access enable row level security;

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
      'house-eviction'
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
      'market-purchase',
      'house-purchase',
      'house-rent',
      'house-transfer-in',
      'house-transfer-out'
    )
  );
