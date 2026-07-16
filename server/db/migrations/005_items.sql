create table items (
  id uuid primary key,
  item_type_id integer not null check (item_type_id between 1 and 65535),
  count smallint not null default 1 check (count between 1 and 100),
  attributes jsonb not null default '{}'::jsonb check (
    jsonb_typeof(attributes) = 'object'
    and octet_length(attributes::text) <= 4096
  ),
  version integer not null default 1 check (version >= 1),
  location_type text not null check (
    location_type in (
      'equipment', 'inventory', 'container', 'world', 'depot', 'inbox',
      'house', 'trade-reservation', 'market-escrow', 'corpse'
    )
  ),
  character_id uuid references characters(id) on delete restrict,
  container_id uuid references items(id) on delete restrict deferrable initially immediate,
  slot_index smallint check (slot_index between 0 and 99),
  equipment_slot text check (
    equipment_slot in (
      'helmet', 'amulet', 'backpack', 'armor', 'weapon', 'shield',
      'legs', 'boots', 'ring', 'ammo'
    )
  ),
  world_map_name varchar(64),
  world_x integer check (world_x between 0 and 65535),
  world_y integer check (world_y between 0 and 65535),
  world_z smallint check (world_z between 0 and 15),
  world_stack_index smallint check (world_stack_index between 0 and 255),
  seed_key varchar(128) unique,
  seed_map_name varchar(64),
  seed_map_version varchar(128),
  seed_x integer check (seed_x between 0 and 65535),
  seed_y integer check (seed_y between 0 and 65535),
  seed_z smallint check (seed_z between 0 and 15),
  seed_stack_index smallint check (seed_stack_index between 0 and 255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_location_shape check (
    (
      location_type = 'equipment'
      and character_id is not null
      and equipment_slot is not null
      and container_id is null and slot_index is null
      and world_map_name is null
      and world_x is null and world_y is null and world_z is null
      and world_stack_index is null
    )
    or
    (
      location_type in (
        'inventory', 'depot', 'inbox', 'trade-reservation', 'market-escrow'
      )
      and character_id is not null and slot_index is not null
      and container_id is null and equipment_slot is null
      and world_map_name is null
      and world_x is null and world_y is null and world_z is null
      and world_stack_index is null
    )
    or
    (
      location_type in ('container', 'corpse')
      and container_id is not null and slot_index is not null
      and character_id is null and equipment_slot is null
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
      and slot_index is null and equipment_slot is null
    )
  ),
  constraint items_seed_shape check (
    (
      seed_key is null and seed_map_name is null and seed_map_version is null
      and seed_x is null and seed_y is null and seed_z is null
      and seed_stack_index is null
    )
    or
    (
      seed_key is not null and seed_map_name is not null
      and seed_map_version is not null
      and seed_x is not null and seed_y is not null and seed_z is not null
      and seed_stack_index is not null
    )
  )
);

create unique index items_equipment_slot_key
  on items(character_id, equipment_slot)
  where location_type = 'equipment';
create unique index items_character_slot_key
  on items(character_id, location_type, slot_index)
  where location_type in (
    'inventory', 'depot', 'inbox', 'trade-reservation', 'market-escrow'
  );
create unique index items_container_slot_key
  on items(container_id, slot_index)
  where location_type in ('container', 'corpse');
create unique index items_world_slot_key
  on items(world_map_name, world_x, world_y, world_z, world_stack_index)
  where location_type in ('world', 'house');
create index items_character_id_idx on items(character_id);
create index items_container_id_idx on items(container_id);
create index items_changed_seed_idx on items(seed_key)
  where seed_key is not null and version > 1;
create index items_unseeded_world_idx
  on items(world_map_name, world_x, world_y, world_z)
  where seed_key is null and location_type = 'world';

create table world_item_seed_versions (
  map_name varchar(64) not null,
  map_version varchar(128) not null,
  seeded_item_count integer not null check (seeded_item_count >= 0),
  completed_at timestamptz not null default now(),
  primary key (map_name, map_version)
);

create function prevent_item_identity_change()
returns trigger
language plpgsql
as $$
begin
  if new.id <> old.id
    or new.seed_key is distinct from old.seed_key
    or new.seed_map_name is distinct from old.seed_map_name
    or new.seed_map_version is distinct from old.seed_map_version
    or new.seed_x is distinct from old.seed_x
    or new.seed_y is distinct from old.seed_y
    or new.seed_z is distinct from old.seed_z
    or new.seed_stack_index is distinct from old.seed_stack_index
  then
    raise exception 'item identity, type, and seed origin are immutable';
  end if;
  return new;
end;
$$;

create trigger items_immutable_identity
before update of id, seed_key, seed_map_name, seed_map_version,
  seed_x, seed_y, seed_z, seed_stack_index on items
for each row execute function prevent_item_identity_change();

create function prevent_item_container_cycle()
returns trigger
language plpgsql
as $$
declare
  has_cycle boolean;
  deepest integer;
begin
  if new.location_type not in ('container', 'corpse') then
    return new;
  end if;
  if new.container_id = new.id then
    raise exception 'an item cannot contain itself';
  end if;

  with recursive ancestry as (
    select id, container_id, 1 as depth
    from items
    where id = new.container_id
    union all
    select parent.id, parent.container_id, ancestry.depth + 1
    from items parent
    join ancestry on parent.id = ancestry.container_id
    where ancestry.depth < 9
  )
  select
    coalesce(bool_or(id = new.id), false),
    coalesce(max(depth), 0)
  into has_cycle, deepest
  from ancestry;

  if has_cycle then
    raise exception 'item container cycle detected';
  end if;
  if deepest >= 8 then
    raise exception 'item container nesting exceeds 8 levels';
  end if;
  return new;
end;
$$;

create trigger items_no_container_cycles
before insert or update of location_type, container_id on items
for each row execute function prevent_item_container_cycle();

alter table items enable row level security;
