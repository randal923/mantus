-- Feature 84: boss reward chests. A reward bag is one character-owned
-- 'reward' item row (slot-indexed like depot/inbox); its contents are
-- ordinary 'container' rows beneath it, so every item keeps exactly one row.
-- reward_grants is the exactly-once gate: the grant transaction's first
-- statement claims (death event, recipient); a conflict means the grant
-- already happened (crash replay, double hook).
-- Constraint bodies restate migration 032's current definitions plus the
-- new location.

drop index items_character_slot_key;

alter table items
  drop constraint items_location_type_check,
  drop constraint items_location_slot_bounds,
  drop constraint items_location_shape,
  add constraint items_location_type_check check (
    location_type in (
      'equipment', 'internal-staging', 'container', 'world', 'depot',
      'inbox', 'house', 'trade-reservation', 'market-escrow', 'corpse',
      'reward'
    )
  ),
  add constraint items_location_slot_bounds check (
    (location_type = 'depot' and slot_index between 0 and 1999)
    or (location_type = 'inbox' and slot_index between 0 and 1999)
    or (location_type = 'market-escrow' and slot_index between 0 and 1999)
    or (location_type = 'reward' and slot_index between 0 and 1999)
    or (location_type in (
      'internal-staging', 'trade-reservation', 'container', 'corpse'
    ) and slot_index between 0 and 99)
    or (location_type in ('equipment', 'world', 'house') and slot_index is null)
  ),
  add constraint items_location_shape check (
    (
      location_type = 'equipment'
      and character_id is not null and equipment_slot is not null
      and container_id is null and slot_index is null and depot_id is null
      and world_map_name is null
      and world_x is null and world_y is null and world_z is null
      and world_stack_index is null
    )
    or
    (
      location_type in (
        'internal-staging', 'inbox', 'trade-reservation', 'market-escrow',
        'reward'
      )
      and character_id is not null and slot_index is not null
      and container_id is null and equipment_slot is null and depot_id is null
      and world_map_name is null
      and world_x is null and world_y is null and world_z is null
      and world_stack_index is null
    )
    or
    (
      location_type = 'depot'
      and character_id is not null and slot_index is not null
      and depot_id is not null
      and container_id is null and equipment_slot is null
      and world_map_name is null
      and world_x is null and world_y is null and world_z is null
      and world_stack_index is null
    )
    or
    (
      location_type in ('container', 'corpse')
      and container_id is not null and slot_index is not null
      and character_id is null and equipment_slot is null and depot_id is null
      and world_map_name is null
      and world_x is null and world_y is null and world_z is null
      and world_stack_index is null
    )
    or
    (
      location_type in ('world', 'house')
      and world_map_name is not null
      and world_x is not null and world_y is not null and world_z is not null
      and world_stack_index is not null
      and character_id is null and container_id is null
      and slot_index is null and equipment_slot is null and depot_id is null
    )
  );

create unique index items_character_slot_key
  on items(character_id, location_type, slot_index)
  where location_type in (
    'internal-staging', 'inbox', 'trade-reservation', 'market-escrow',
    'reward'
  );

create table reward_grants (
  grant_key varchar(192) primary key,
  character_id uuid not null references characters(id) on delete cascade,
  -- Null when the roll produced nothing; the claim still blocks replays.
  bag_item_id uuid,
  created_at timestamptz not null default now()
);

create index reward_grants_character_id_idx on reward_grants(character_id);

alter table reward_grants enable row level security;

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
      'reward-collect'
    )
  );
