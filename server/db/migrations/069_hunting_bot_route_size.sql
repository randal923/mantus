-- 068's 8 KB cap was smaller than a legal route: the protocol allows 200
-- waypoints and a traced ring of 181 already measures past 8 KB as jsonb,
-- so saving any full-size traced route violated the constraint, failed the
-- write, and rolled the hunting-bot window back to its previous route.
-- Re-derived from the worst legal route (200 waypoints, 64-char hunt name,
-- ~12 KB as jsonb) with headroom. Still defence in depth — the message
-- schema caps the waypoint count itself.
alter table characters
  drop constraint if exists characters_hunting_bot_size;
alter table characters
  add constraint characters_hunting_bot_size
  check (pg_column_size(hunting_bot) <= 32768);
