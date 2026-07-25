-- Canary text house access lists, including per-door lists (todo 15,
-- Feature 62).
--
-- The shipped `house_access` table holds explicit per-character invitations.
-- These are the free-text Canary lists layered on top: `@guild` / `rank@guild`
-- entries and `*`/`?`/`!` wildcards. A character has access when *either*
-- source grants it.
--
-- Guild entries are stored as names, never as a resolved membership snapshot,
-- so leaving a guild takes effect on the very next step or door use.
--
-- kind: 0 house-wide guest list, 1 subowner list, 2 per-door list. Door lists
-- are keyed by their tile; the two house-wide lists use the sentinel 0/0/0
-- coordinates so the primary key covers both shapes.

create table house_lists (
  house_id integer not null references houses(house_id) on delete cascade,
  kind smallint not null check (kind in (0, 1, 2)),
  door_x integer not null default 0 check (door_x between 0 and 65535),
  door_y integer not null default 0 check (door_y between 0 and 65535),
  door_z smallint not null default 0 check (door_z between 0 and 15),
  body text not null check (char_length(body) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (house_id, kind, door_x, door_y, door_z),
  -- Only door lists may carry a tile; the house-wide lists stay on 0/0/0.
  constraint house_lists_door_coordinates check (
    kind = 2 or (door_x = 0 and door_y = 0 and door_z = 0)
  )
);

alter table house_lists enable row level security;
