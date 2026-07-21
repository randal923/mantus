alter table characters
  add column if not exists potion_action_bar jsonb not null default '[]'::jsonb;

alter table characters
  drop constraint if exists characters_potion_action_bar_size;
alter table characters
  add constraint characters_potion_action_bar_size
  check (pg_column_size(potion_action_bar) <= 2048);
