-- Per-character auto-loot configuration. A blacklist: with `enabled` set the
-- server sweeps a corpse the character killed, skipping the listed item types.
-- The client only ever sends what to skip; what is actually taken is re-derived
-- from the live corpse inside the tick. The size cap is defence in depth
-- against oversized blobs — the entry count is capped in the schema too.
alter table characters
  add column if not exists loot_filter jsonb not null
  default '{"enabled": false, "ignoredItemTypeIds": []}'::jsonb;

alter table characters
  drop constraint if exists characters_loot_filter_size;
alter table characters
  add constraint characters_loot_filter_size
  check (pg_column_size(loot_filter) <= 4096);
