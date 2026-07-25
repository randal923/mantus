-- Per-character "aim at target" spell set: the spells whose direction cast
-- derives its direction from the live attack target instead of the player's
-- facing. Stored as a JSON array of spell ids; the server re-validates the
-- shape and every id against the character's own spell list before writing,
-- and re-derives the direction itself at cast time. The size cap is defense
-- in depth against oversized blobs.
alter table characters
  add column if not exists aim_at_target_spells jsonb not null
  default '[]'::jsonb;

alter table characters
  drop constraint if exists characters_aim_at_target_spells_size;
alter table characters
  add constraint characters_aim_at_target_spells_size
  check (pg_column_size(aim_at_target_spells) <= 2048);
