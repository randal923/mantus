-- Per-character spell bar layout (slot index -> spell id, null = empty).
-- The server validates the shape against the protocol actionBarSchema and the
-- character's own spell list before writing; the size cap is defense in depth
-- against oversized blobs.
alter table characters
  add column if not exists action_bar jsonb not null default '[]'::jsonb;

alter table characters drop constraint if exists characters_action_bar_size;
alter table characters
  add constraint characters_action_bar_size
  check (pg_column_size(action_bar) <= 2048);
