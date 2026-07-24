create function consume_owned_combat_item(
  p_character_id uuid,
  p_item_id uuid,
  p_expected_version integer,
  p_count integer,
  p_reason text
)
returns table (
  before_item jsonb,
  after_item jsonb,
  removed_item_id uuid
)
language plpgsql
as $$
declare
  source_item items%rowtype;
  updated_item items%rowtype;
  ownership_character_id uuid;
  ownership_location_type text;
begin
  perform 1
  from characters
  where id = p_character_id
  for update;
  if not found then
    raise exception 'character not found';
  end if;

  select *
  into source_item
  from items
  where id = p_item_id
  for update;
  if not found then
    raise exception 'item not found';
  end if;
  if source_item.version <> p_expected_version then
    raise exception 'stale item revision';
  end if;
  if (
    p_count is null
    or p_count < 1
    or p_count > source_item.count
  ) then
    raise exception 'invalid consume count';
  end if;
  if p_reason not in ('rune', 'ammunition', 'break', 'food') then
    raise exception 'invalid consume reason';
  end if;

  with recursive ancestry as (
    select id, container_id, character_id, location_type, 1 as depth
    from items
    where id = source_item.id
    union all
    select
      parent.id,
      parent.container_id,
      parent.character_id,
      parent.location_type,
      ancestry.depth + 1
    from items parent
    join ancestry on parent.id = ancestry.container_id
    where ancestry.depth < 8
  )
  select character_id, location_type
  into ownership_character_id, ownership_location_type
  from ancestry
  where character_id is not null
  order by depth desc
  limit 1;

  if (
    ownership_character_id is distinct from p_character_id
    or ownership_location_type is distinct from 'equipment'
  ) then
    raise exception 'item is not owned by character';
  end if;

  before_item := to_jsonb(source_item);
  if p_count = source_item.count then
    delete from items where id = source_item.id;
    after_item := null;
    removed_item_id := source_item.id;
  else
    update items
    set
      count = count - p_count,
      version = version + 1,
      updated_at = now()
    where id = source_item.id
    returning * into updated_item;
    after_item := to_jsonb(updated_item);
    removed_item_id := null;
  end if;

  insert into audit_log(event_type, character_id, item_id, details)
  values (
    'item-destroyed',
    p_character_id,
    source_item.id,
    jsonb_build_object(
      'itemTypeId', source_item.item_type_id,
      'count', p_count,
      'reason', p_reason
    )
  );

  return next;
end
$$;
