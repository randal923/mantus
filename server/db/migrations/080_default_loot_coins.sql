-- Every character's auto-loot pick-up list starts with the three coin
-- denominations (gold 3031, platinum 3035, crystal 3043) — the default
-- nobody hunts without; players remove them like any other rule. The sweep
-- itself stays opt-in: `enabled` is untouched everywhere.
alter table characters
  alter column loot_filter
  set default '{"enabled": false, "pickupRules": [{"typeId": 3031}, {"typeId": 3035}, {"typeId": 3043}]}'::jsonb;

-- Seed the coins into existing characters, appending only the denominations
-- a list is missing. Lists with more than 197 rules are left alone: the
-- message schema caps a list at 200 rules, and pushing a row past that
-- would make it fail parse at login and degrade to the default — wiping a
-- list the player curated is far worse than skipping the seed.
update characters ch
set loot_filter = jsonb_set(
  ch.loot_filter,
  '{pickupRules}',
  (ch.loot_filter -> 'pickupRules') || (
    select coalesce(
      jsonb_agg(jsonb_build_object('typeId', coin.id) order by coin.id),
      '[]'::jsonb
    )
    from (values (3031), (3035), (3043)) as coin(id)
    where not exists (
      select 1
      from jsonb_array_elements(ch.loot_filter -> 'pickupRules') as rule
      where (rule ->> 'typeId')::int = coin.id
    )
  )
)
where jsonb_typeof(ch.loot_filter -> 'pickupRules') = 'array'
  and jsonb_array_length(ch.loot_filter -> 'pickupRules') <= 197
  and exists (
    select 1
    from (values (3031), (3035), (3043)) as coin(id)
    where not exists (
      select 1
      from jsonb_array_elements(ch.loot_filter -> 'pickupRules') as rule
      where (rule ->> 'typeId')::int = coin.id
    )
  );
