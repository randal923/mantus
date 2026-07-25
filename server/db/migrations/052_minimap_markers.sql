-- Persistent minimap waypoint flags (todo 16, Feature 68).
--
-- Markers are per-character annotations with no gameplay effect, so they are
-- deliberately plain: the tile is the key, which makes "place a flag here"
-- idempotent and caps the list by construction alongside the count check the
-- service enforces. They are private — a marker list is only ever sent to its
-- own character.

create table character_map_markers (
  character_id uuid not null references characters(id) on delete cascade,
  position_x integer not null check (position_x between 0 and 65535),
  position_y integer not null check (position_y between 0 and 65535),
  position_z smallint not null check (position_z between 0 and 15),
  icon smallint not null default 0 check (icon between 0 and 20),
  text varchar(40) not null default '',
  created_at timestamptz not null default now(),
  primary key (character_id, position_x, position_y, position_z)
);

alter table character_map_markers enable row level security;
