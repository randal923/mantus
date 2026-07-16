create or replace function prevent_item_identity_change()
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
    raise exception 'item identity and seed origin are immutable';
  end if;
  return new;
end;
$$;
