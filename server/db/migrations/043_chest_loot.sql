-- Placed quest chests (todo 13, Feature 50).
--
-- Canary gates each chest on a per-character storage value: 0 means "not
-- looted", 1 means "looted", and the six timed chests additionally hold a
-- unix deadline. That gate is the exactly-once guard for the reward grant, so
-- it lives in its own table rather than in `character_storages`: the grant is
-- one serializable transaction whose first statement claims the gate, and a
-- replayed use finds the claim already taken and grants nothing.
--
-- `looted_key` (not the chest's unique id) is the gate identity: Canary's
-- paired chests share one storage constant, so looting either closes both.
-- `available_at` is null for a one-time chest and a future deadline for a
-- repeatable one; the claim is a single INSERT ... ON CONFLICT DO UPDATE
-- guarded by `available_at <= now()`, which is idempotent under retry.
create table character_chest_loot (
  character_id uuid not null references characters(id) on delete cascade,
  looted_key varchar(128) not null,
  chest_unique_id integer not null check (chest_unique_id > 0),
  looted_at timestamptz not null default now(),
  available_at timestamptz,
  primary key (character_id, looted_key)
);

alter table character_chest_loot enable row level security;

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
      'chest-loot'
    )
  );
