alter table items
  add column depot_id integer check (depot_id between 1 and 65535);

update items
set depot_id = characters.town_id
from characters
where items.location_type = 'depot'
  and items.character_id = characters.id;

drop index items_character_slot_key;

alter table items
  drop constraint items_slot_index_check,
  drop constraint items_location_shape,
  add constraint items_slot_index_check check (slot_index between 0 and 1999),
  add constraint items_location_slot_bounds check (
    (location_type = 'depot' and slot_index between 0 and 1999)
    or (location_type = 'inbox' and slot_index between 0 and 1999)
    or (location_type in (
      'inventory', 'trade-reservation', 'market-escrow', 'container', 'corpse'
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
        'inventory', 'inbox', 'trade-reservation', 'market-escrow'
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
    'inventory', 'inbox', 'trade-reservation', 'market-escrow'
  );

create unique index items_depot_slot_key
  on items(character_id, depot_id, slot_index)
  where location_type = 'depot';

create table character_depots (
  character_id uuid not null references characters(id) on delete restrict,
  depot_id integer not null check (depot_id between 1 and 65535),
  capacity smallint not null default 2000 check (capacity = 2000),
  revision integer not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  primary key (character_id, depot_id)
);

insert into character_depots (character_id, depot_id)
select distinct character_id, depot_id
from items
where location_type = 'depot';

alter table character_depots enable row level security;

create table character_storage_state (
  character_id uuid primary key references characters(id) on delete restrict,
  inbox_capacity smallint not null default 2000 check (inbox_capacity = 2000),
  inbox_revision integer not null default 1 check (inbox_revision >= 1),
  stash_revision integer not null default 1 check (stash_revision >= 1),
  updated_at timestamptz not null default now()
);

insert into character_storage_state (character_id)
select distinct character_id
from items
where location_type = 'inbox'
on conflict do nothing;

alter table character_storage_state enable row level security;

create table supply_stash (
  character_id uuid not null references characters(id) on delete restrict,
  item_type_id integer not null check (item_type_id between 1 and 65535),
  count bigint not null check (count between 1 and 1000000000),
  updated_at timestamptz not null default now(),
  primary key (character_id, item_type_id)
);

alter table supply_stash enable row level security;

create table inbox_deliveries (
  delivery_key varchar(128) primary key check (
    delivery_key ~ '^[A-Za-z0-9:_-]+$'
  ),
  delivery_kind text not null check (
    delivery_kind in ('mail', 'reward', 'system')
  ),
  recipient_character_id uuid not null references characters(id) on delete restrict,
  return_character_id uuid references characters(id) on delete restrict,
  item_id uuid unique references items(id) on delete set null,
  original_item_id uuid not null,
  status text not null default 'delivered' check (
    status in ('delivered', 'claimed', 'returned')
  ),
  delivered_at timestamptz not null default now(),
  expires_at timestamptz,
  completed_at timestamptz,
  check (
    (delivery_kind = 'mail' and return_character_id is not null and expires_at is not null)
    or (delivery_kind in ('reward', 'system') and expires_at is null)
  ),
  check (return_character_id is null or return_character_id <> recipient_character_id)
);

create index inbox_deliveries_expiry_idx
  on inbox_deliveries(expires_at)
  where status = 'delivered' and expires_at is not null;

alter table inbox_deliveries enable row level security;
