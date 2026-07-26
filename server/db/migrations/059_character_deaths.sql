-- Cyclopedia recent-deaths view (Feature 83): one durable row per player
-- death, written write-behind from the death path. The projection reads a
-- 30-day window like Canary player_cyclopedia.cpp:36-150; PvP kill rows
-- already live in character_kills (migration 018).

create table character_deaths (
  id bigserial primary key,
  character_id uuid not null references characters(id) on delete cascade,
  level integer not null check (level >= 1),
  cause varchar(200) not null,
  occurred_at timestamptz not null default now()
);

create index character_deaths_character_occurred_idx
  on character_deaths(character_id, occurred_at desc, id desc);

alter table character_deaths enable row level security;
