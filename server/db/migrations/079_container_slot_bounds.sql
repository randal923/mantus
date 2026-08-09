-- Container slots were still capped at 99 from the pre-pouch era, while the
-- Loot Pouch and the bound container both declare 500 slots
-- (MAX_CONTAINER_CAPACITY): the 101st distinct slot in either would have
-- violated the CHECK and poisoned the owner's persist lane. Raise container
-- and corpse slots to 0..499; staging and trade-reservation keep their old
-- bound.

alter table items
  drop constraint items_location_slot_bounds,
  add constraint items_location_slot_bounds check (
    (location_type = 'depot' and slot_index between 0 and 1999)
    or (location_type = 'inbox' and slot_index between 0 and 1999)
    or (location_type = 'market-escrow' and slot_index between 0 and 1999)
    or (location_type = 'reward' and slot_index between 0 and 1999)
    or (location_type in ('container', 'corpse')
        and slot_index between 0 and 499)
    or (location_type in ('internal-staging', 'trade-reservation')
        and slot_index between 0 and 99)
    or (location_type in ('equipment', 'world', 'house') and slot_index is null)
  );
