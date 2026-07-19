-- PVP skull system (todo 14c): durable player-kill (frag) rows, persistent
-- skull columns on characters, and the pvp-skull-sanction audit event.

create table character_kills (
  id uuid primary key default gen_random_uuid(),
  -- Exactly-once key: one death event charges each killer at most once,
  -- even if the death path is replayed.
  death_event_id varchar(128) not null,
  killer_character_id uuid not null references characters(id) on delete cascade,
  victim_character_id uuid not null references characters(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  unjustified boolean not null,
  avenged boolean not null default false,
  unique (death_event_id, killer_character_id)
);

create index character_kills_killer_occurred_at_idx
  on character_kills(killer_character_id, occurred_at desc);
create index character_kills_victim_occurred_at_idx
  on character_kills(victim_character_id, occurred_at desc);

alter table character_kills enable row level security;

-- skull: 0 none, 1 white, 2 red, 3 black.
alter table characters
  add column skull smallint not null default 0 check (skull between 0 and 3),
  add column skull_expires_at timestamptz;

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
      'pvp-skull-sanction'
    )
  );
