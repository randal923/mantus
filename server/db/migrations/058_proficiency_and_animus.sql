-- Weapon proficiency and animus mastery (Feature 82), transcribed from
-- pinned Canary weapon_proficiency.cpp (KV scope "weapon-proficiency") and
-- animus_mastery.cpp (players.animus_mastery blob).
--
--   * character_weapon_proficiencies — one row per (character, proficiency
--     profile): the accrued experience, the mastery flag, and the selected
--     perks. Experience only ever grows from server-side kill events;
--     selections are validated against it at execution time.
--
--   * character_animus_masteries — one row per mastered race. The earn path
--     (Soul Pit) is deferred; grants come from server-side systems only.

create table character_weapon_proficiencies (
  character_id uuid not null references characters(id) on delete cascade,
  proficiency_id integer not null check (proficiency_id > 0),
  experience bigint not null default 0 check (experience >= 0),
  mastered boolean not null default false,
  selections jsonb not null default '[]'::jsonb check (
    jsonb_typeof(selections) = 'array'
    and octet_length(selections::text) <= 2048
  ),
  primary key (character_id, proficiency_id)
);

alter table character_weapon_proficiencies enable row level security;

create table character_animus_masteries (
  character_id uuid not null references characters(id) on delete cascade,
  race_id integer not null check (race_id > 0),
  granted_at timestamptz not null default now(),
  primary key (character_id, race_id)
);

alter table character_animus_masteries enable row level security;
