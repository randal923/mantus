-- Level is derived from experience in the progression runtime. Reconcile
-- legacy rows before enforcing that invariant; this also removes impossible
-- test values such as a high level with zero experience.
with derived_levels as (
  select
    characters.id,
    max(candidate)::integer as level
  from characters
  cross join generate_series(1, 1000) as candidate
  where floor(
    ((((candidate::numeric - 6) * candidate + 17) * candidate - 12) * 100) / 6
  ) <= characters.experience
  group by characters.id
)
update characters
set
  level = derived_levels.level,
  updated_at = now(),
  version = version + 1
from derived_levels
where
  characters.id = derived_levels.id
  and characters.level is distinct from derived_levels.level;

alter table characters
  drop constraint characters_vocation_check,
  add constraint characters_vocation_check check (
    vocation in (
      'Knight', 'Paladin', 'Sorcerer', 'Druid',
      'Elite Knight', 'Royal Paladin', 'Master Sorcerer', 'Elder Druid'
    )
  ),
  drop constraint characters_level_check,
  add constraint characters_level_check check (level between 1 and 1000),
  drop constraint characters_experience_check,
  add constraint characters_experience_check check (
    experience between 0 and 16566949800
  ),
  drop constraint characters_check,
  drop constraint characters_check1,
  drop constraint characters_capacity_check,
  drop column max_health,
  drop column max_mana,
  drop column capacity,
  add column magic_level integer not null default 0
    check (magic_level between 0 and 200),
  add column mana_spent bigint not null default 0
    check (mana_spent between 0 and 9007199254740991),
  add column soul smallint not null default 100
    check (soul between 0 and 200),
  add column progression_definition_version integer not null default 1
    check (progression_definition_version > 0),
  add constraint characters_health_upper_bound check (health <= 100000),
  add constraint characters_mana_upper_bound check (mana <= 100000);

create table character_skills (
  character_id uuid not null references characters(id) on delete cascade,
  skill text not null check (
    skill in ('fist', 'club', 'sword', 'axe', 'distance', 'shielding', 'fishing')
  ),
  level smallint not null default 10 check (level between 10 and 200),
  tries bigint not null default 0
    check (tries between 0 and 9007199254740991),
  primary key (character_id, skill)
);

insert into character_skills (character_id, skill)
select characters.id, skills.skill
from characters
cross join (
  values
    ('fist'),
    ('club'),
    ('sword'),
    ('axe'),
    ('distance'),
    ('shielding'),
    ('fishing')
) as skills(skill);

alter table character_skills enable row level security;

create table progression_events (
  character_id uuid not null references characters(id) on delete cascade,
  event_id varchar(128) not null check (
    event_id ~ '^[A-Za-z0-9:_-]+$'
  ),
  event_type text not null check (
    event_type in ('experience', 'skill', 'magic')
  ),
  occurred_at timestamptz not null default now(),
  primary key (character_id, event_id)
);

create index progression_events_character_occurred_at_idx
  on progression_events(character_id, occurred_at desc);

alter table progression_events enable row level security;
