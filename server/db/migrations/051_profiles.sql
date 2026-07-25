-- Profile projections (todo 15, Feature 67): achievements, titles, badges,
-- namelocks, and bug reports.
--
-- Grants are exactly-once by construction: the primary key is
-- (character, thing), every grant is an `ON CONFLICT DO NOTHING` insert, and
-- the row count tells the caller whether *this* call was the one that granted
-- it. A replayed progression event, a double-delivered bestiary completion, or
-- two concurrent grant paths therefore all leave exactly one row and announce
-- the achievement once.
--
-- Nothing here is player-writable. The only thing a character chooses is
-- which of their *granted* titles is displayed, and that is validated against
-- these rows at execution time before it reaches any projection.

create table character_achievements (
  character_id uuid not null references characters(id) on delete cascade,
  achievement_id varchar(64) not null,
  granted_at timestamptz not null default now(),
  primary key (character_id, achievement_id)
);

create index character_achievements_character_idx
  on character_achievements(character_id);

alter table character_achievements enable row level security;

create table character_titles (
  character_id uuid not null references characters(id) on delete cascade,
  title_id varchar(64) not null,
  granted_at timestamptz not null default now(),
  primary key (character_id, title_id)
);

alter table character_titles enable row level security;

create table character_badges (
  character_id uuid not null references characters(id) on delete cascade,
  badge_id varchar(64) not null,
  granted_at timestamptz not null default now(),
  primary key (character_id, badge_id)
);

alter table character_badges enable row level security;

alter table characters
  -- The displayed title; always validated against character_titles first.
  add column selected_title varchar(64),
  -- A namelocked character cannot enter the world until it is renamed
  -- (the rename flow itself is Feature 2).
  add column namelocked boolean not null default false;

-- Ctrl+Z style bug reports. Durable, rate-limited, and never trusted: the
-- reporter and their position are server-derived, the client supplies only
-- the text.
create table bug_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_character_id uuid not null references characters(id) on delete cascade,
  category text not null check (
    category in ('bug', 'typo', 'map', 'other')
  ),
  message varchar(500) not null,
  position_x integer not null check (position_x between 0 and 65535),
  position_y integer not null check (position_y between 0 and 65535),
  position_z smallint not null check (position_z between 0 and 15),
  created_at timestamptz not null default now()
);

create index bug_reports_reporter_created_idx
  on bug_reports(reporter_character_id, created_at desc);

alter table bug_reports enable row level security;
