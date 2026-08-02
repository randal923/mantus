-- Per-character hunting route: the ordered ring of tiles the hunting bot
-- walks. It is inert geometry, not a movement authority — the server paths to
-- each waypoint itself and re-validates every step inside the tick, so a
-- hand-edited waypoint can never teleport a character or outrun walk speed.
-- Whether the bot is *running* is deliberately not stored: a character must
-- never log in already walking. The size cap is defence in depth; the
-- waypoint count is capped in the schema too.
alter table characters
  add column if not exists hunting_bot jsonb not null
  default '{"huntName": "", "waypoints": []}'::jsonb;

alter table characters
  drop constraint if exists characters_hunting_bot_size;
alter table characters
  add constraint characters_hunting_bot_size
  check (pg_column_size(hunting_bot) <= 8192);
