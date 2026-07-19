create table guilds (
  id uuid primary key default gen_random_uuid(),
  name varchar(29) not null,
  owner_character_id uuid not null unique references characters(id) on delete cascade,
  motd varchar(255) not null default '',
  created_at timestamptz not null default now(),
  constraint guilds_name_format check (
    char_length(name) between 3 and 29
    and name ~ '^[A-Za-z]+( [A-Za-z]+)*$'
  )
);

-- Two "Red Rose" / "red rose" guilds can never coexist; concurrent creates
-- surface as a unique violation mapped to name-taken.
create unique index guilds_normalized_name_idx on guilds (lower(btrim(name)));

alter table guilds enable row level security;

create table guild_ranks (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references guilds(id) on delete cascade,
  level integer not null check (level in (1, 2, 3)),
  name varchar(40) not null check (char_length(name) between 1 and 40),
  unique (guild_id, level)
);

alter table guild_ranks enable row level security;

create table guild_members (
  -- Single-column primary key: one guild per character, enforced by the
  -- database against concurrent invite acceptances.
  character_id uuid primary key references characters(id) on delete cascade,
  guild_id uuid not null references guilds(id) on delete cascade,
  rank_id uuid not null references guild_ranks(id),
  nick varchar(15) not null default '',
  joined_at timestamptz not null default now()
);

create index guild_members_guild_id_idx on guild_members(guild_id);

alter table guild_members enable row level security;

create table guild_invites (
  character_id uuid not null references characters(id) on delete cascade,
  guild_id uuid not null references guilds(id) on delete cascade,
  invited_by_character_id uuid not null references characters(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (character_id, guild_id)
);

create index guild_invites_guild_id_idx on guild_invites(guild_id);

alter table guild_invites enable row level security;

-- status: 0 pending, 1 active, 2 rejected, 3 canceled, 4 ended.
create table guild_wars (
  id uuid primary key default gen_random_uuid(),
  guild1_id uuid not null references guilds(id) on delete cascade,
  guild2_id uuid not null references guilds(id) on delete cascade,
  status integer not null default 0 check (status between 0 and 4),
  frag_limit integer not null check (frag_limit between 1 and 1000),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  winner_guild_id uuid references guilds(id) on delete set null,
  check (guild1_id <> guild2_id)
);

create index guild_wars_guild1_id_idx on guild_wars(guild1_id);
create index guild_wars_guild2_id_idx on guild_wars(guild2_id);

-- At most one pending or active war per unordered guild pair; concurrent
-- declarations surface as a unique violation mapped to war-already-active.
create unique index guild_wars_open_pair_idx
  on guild_wars (least(guild1_id, guild2_id), greatest(guild1_id, guild2_id))
  where status in (0, 1);

alter table guild_wars enable row level security;

create table guild_war_kills (
  id uuid primary key default gen_random_uuid(),
  war_id uuid not null references guild_wars(id) on delete cascade,
  killer_character_id uuid references characters(id) on delete set null,
  target_character_id uuid references characters(id) on delete set null,
  killer_guild_id uuid not null,
  target_guild_id uuid not null,
  occurred_at timestamptz not null default now()
);

create index guild_war_kills_war_id_idx on guild_war_kills(war_id);

alter table guild_war_kills enable row level security;
