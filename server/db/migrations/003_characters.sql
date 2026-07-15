create table characters (
  id uuid primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  display_name varchar(20) not null,
  normalized_name varchar(20) not null unique,
  vocation text not null check (vocation in ('Knight', 'Paladin', 'Sorcerer', 'Druid')),
  level integer not null default 1 check (level >= 1),
  experience bigint not null default 0 check (experience between 0 and 9007199254740991),
  health integer not null check (health >= 0),
  max_health integer not null check (max_health > 0 and health <= max_health),
  mana integer not null check (mana >= 0),
  max_mana integer not null check (max_mana >= 0 and mana <= max_mana),
  capacity integer not null check (capacity >= 0),
  position_x integer not null check (position_x between 0 and 65535),
  position_y integer not null check (position_y between 0 and 65535),
  position_z smallint not null check (position_z between 0 and 15),
  direction text not null check (direction in ('north', 'east', 'south', 'west')),
  outfit_look_type integer not null check (outfit_look_type in (128, 136)),
  outfit_head smallint not null check (outfit_head between 0 and 132),
  outfit_body smallint not null check (outfit_body between 0 and 132),
  outfit_legs smallint not null check (outfit_legs between 0 and 132),
  outfit_feet smallint not null check (outfit_feet between 0 and 132),
  outfit_addons smallint not null default 0 check (outfit_addons between 0 and 3),
  town_id integer not null check (town_id > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  version integer not null default 1 check (version >= 1),
  constraint characters_display_name_format check (
    char_length(display_name) between 3 and 20
    and display_name ~ '^[A-Za-z]+( [A-Za-z]+)*$'
  ),
  constraint characters_normalized_name_matches check (
    normalized_name = lower(display_name)
  )
);

create index characters_account_id_idx on characters(account_id);

alter table characters enable row level security;

create function prevent_character_identity_change()
returns trigger
language plpgsql
as $$
begin
  if new.id <> old.id or new.account_id <> old.account_id then
    raise exception 'character identity and ownership are immutable';
  end if;
  return new;
end;
$$;

create trigger characters_immutable_identity
before update of id, account_id on characters
for each row execute function prevent_character_identity_change();
