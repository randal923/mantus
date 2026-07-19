-- Social services (todo 14e): per-character VIP lists and the indexes the
-- bounded highscore read models rely on. VIP lists are private to their
-- owning character; presence fan-out lives in server memory only. VIP
-- groups are deferred (flat list first).

create table character_vips (
  character_id uuid not null references characters(id) on delete cascade,
  vip_character_id uuid not null references characters(id) on delete cascade,
  description varchar(128) not null default '',
  icon smallint not null default 0 check (icon between 0 and 10),
  notify_login boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (character_id, vip_character_id),
  check (character_id <> vip_character_id)
);

create index character_vips_vip_character_id_idx
  on character_vips(vip_character_id);

alter table character_vips enable row level security;

-- Highscore read models order by these columns with a hard 1000-row depth.
create index characters_experience_desc_idx on characters (experience desc);
create index characters_magic_level_desc_idx on characters (magic_level desc);
create index character_skills_skill_level_desc_idx
  on character_skills (skill, level desc);
