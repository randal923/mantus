-- The auto-loot filter became a pick-up list: with `enabled` set, the sweep
-- takes only the listed types, and only in the listed rarity grades. 066's
-- shape said the opposite ("skip these types"), and there is no honest way to
-- read intent out of a blacklist and write it as a whitelist — an inverted
-- row would either take everything the player had chosen to leave or leave
-- everything they had chosen to take. Every stored filter is therefore reset
-- to the disabled default and the player re-picks what to take; auto-loot
-- stays off until they do, so nothing is swept unasked in the meantime.
update characters
  set loot_filter = '{"enabled": false, "pickupRules": []}'::jsonb
  where loot_filter ? 'ignoredItemTypeIds' or not (loot_filter ? 'pickupRules');

alter table characters
  alter column loot_filter
  set default '{"enabled": false, "pickupRules": []}'::jsonb;

-- A rule is an object now, and a full list may name all five grades per type:
-- 200 rules of {"typeId":65535,"rarities":[...5 grades...]} measure ~15 KB as
-- jsonb. Re-derived from that worst legal list with headroom; the entry count
-- itself is still capped in the message schema.
alter table characters
  drop constraint if exists characters_loot_filter_size;
alter table characters
  add constraint characters_loot_filter_size
  check (pg_column_size(loot_filter) <= 32768);
