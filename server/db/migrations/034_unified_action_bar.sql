-- The unified 18-slot action bar stores typed actions and hotkeys. The legacy
-- potion_action_bar column now stores bounded action-bot settings so existing
-- installations can migrate without dropping character preferences.
alter table characters
  drop constraint if exists characters_action_bar_size;
alter table characters
  add constraint characters_action_bar_size
  check (pg_column_size(action_bar) <= 8192);

alter table characters
  drop constraint if exists characters_potion_action_bar_size;
alter table characters
  add constraint characters_potion_action_bar_size
  check (pg_column_size(potion_action_bar) <= 8192);
