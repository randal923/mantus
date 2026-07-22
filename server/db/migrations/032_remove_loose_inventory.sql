do $$
begin
  if exists (select 1 from items where location_type = 'inventory') then
    raise exception using
      message = 'loose inventory items must be reconciled before migration 032',
      hint = 'Stop the game server and run yarn workspace server db:reconcile-loose-inventory, then rerun yarn db:migrate.';
  end if;
end
$$;

drop index items_character_slot_key;

alter table items
  drop constraint items_location_type_check,
  drop constraint items_location_slot_bounds,
  drop constraint items_location_shape,
  add constraint items_location_type_check check (
    location_type in (
      'equipment', 'internal-staging', 'container', 'world', 'depot',
      'inbox', 'house', 'trade-reservation', 'market-escrow', 'corpse'
    )
  ),
  add constraint items_location_slot_bounds check (
    (location_type = 'depot' and slot_index between 0 and 1999)
    or (location_type = 'inbox' and slot_index between 0 and 1999)
    or (location_type = 'market-escrow' and slot_index between 0 and 1999)
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
        'internal-staging', 'inbox', 'trade-reservation', 'market-escrow'
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
    'internal-staging', 'inbox', 'trade-reservation', 'market-escrow'
  );

create function reject_committed_item_staging()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from items
    where id = new.id and location_type = 'internal-staging'
  ) then
    raise exception 'item % cannot commit in internal staging', new.id;
  end if;
  return null;
end
$$;

create constraint trigger items_no_committed_internal_staging
after insert or update on items
deferrable initially deferred
for each row
when (new.location_type = 'internal-staging')
execute function reject_committed_item_staging();
