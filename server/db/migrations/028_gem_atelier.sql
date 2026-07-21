-- Gem Atelier + Fragment Workshop (Wheel of Destiny extension).
-- Gems and fragments are per-character balances/rows, not inventory items
-- (Canary keeps revealed gems outside the item system too). Domain and
-- quality use Canary's numeric encodings: domain 0..3 = green/red/blue/
-- purple, quality 0..2 = lesser/regular/greater.

create table character_gem_resources (
  character_id uuid primary key references characters(id) on delete cascade,
  lesser_gems integer not null default 0 check (lesser_gems >= 0),
  regular_gems integer not null default 0 check (regular_gems >= 0),
  greater_gems integer not null default 0 check (greater_gems >= 0),
  lesser_fragments integer not null default 0 check (lesser_fragments >= 0),
  greater_fragments integer not null default 0 check (greater_fragments >= 0),
  updated_at timestamptz not null default now()
);

alter table character_gem_resources enable row level security;

create table character_gems (
  id uuid primary key,
  character_id uuid not null references characters(id) on delete cascade,
  domain smallint not null check (domain between 0 and 3),
  quality smallint not null check (quality between 0 and 2),
  basic_mod_1 smallint not null check (basic_mod_1 between 0 and 48),
  basic_mod_2 smallint check (basic_mod_2 between 0 and 48),
  supreme_mod smallint check (supreme_mod between 0 and 93),
  locked boolean not null default false,
  equipped boolean not null default false,
  created_at timestamptz not null default now(),
  check ((quality >= 1) = (basic_mod_2 is not null)),
  check ((quality = 2) = (supreme_mod is not null))
);

create index character_gems_character_id_idx
  on character_gems(character_id);
-- One equipped gem per domain vessel.
create unique index character_gems_equipped_domain_idx
  on character_gems(character_id, domain) where equipped;

alter table character_gems enable row level security;

create table character_gem_grades (
  character_id uuid not null references characters(id) on delete cascade,
  -- 0 = basic (lesser fragments), 1 = supreme (greater fragments).
  mod_kind smallint not null check (mod_kind in (0, 1)),
  mod_id smallint not null check (mod_id between 0 and 93),
  grade smallint not null check (grade between 1 and 3),
  updated_at timestamptz not null default now(),
  primary key (character_id, mod_kind, mod_id)
);

alter table character_gem_grades enable row level security;

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
      'gem-grade-improve'
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
      'house-transfer-out',
      'gem-atelier'
    )
  );
