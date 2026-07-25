-- Friend-system completion (todo 15, Feature 65).
--
-- The shipped `character_vips` list is one-way and private: adding someone
-- tells them nothing. Reciprocal friendship is a separate, mutual relation,
-- so it gets its own tables rather than a flag on the VIP row.
--
-- A request is a directed row. Accepting it writes *both* halves of
-- `character_friends` and deletes the request in one transaction, so a
-- friendship can never exist in one direction only. The responder addresses
-- the request by the requester id the server itself sent them; a forged id
-- simply matches no row.
--
-- VIP groups are per-character named buckets; deleting one drops its entries
-- back to the ungrouped list rather than deleting them (on delete set null).
--
-- `character_social_settings` holds the privacy switches other systems read
-- at query time — today only the party finder's visibility (Feature 56).

create table character_friend_requests (
  from_character_id uuid not null references characters(id) on delete cascade,
  to_character_id uuid not null references characters(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_character_id, to_character_id),
  check (from_character_id <> to_character_id)
);

create index character_friend_requests_to_idx
  on character_friend_requests(to_character_id);

alter table character_friend_requests enable row level security;

create table character_friends (
  character_id uuid not null references characters(id) on delete cascade,
  friend_character_id uuid not null references characters(id) on delete cascade,
  since timestamptz not null default now(),
  primary key (character_id, friend_character_id),
  check (character_id <> friend_character_id)
);

create index character_friends_friend_character_id_idx
  on character_friends(friend_character_id);

alter table character_friends enable row level security;

create table character_vip_groups (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references characters(id) on delete cascade,
  name varchar(32) not null,
  created_at timestamptz not null default now(),
  unique (character_id, name)
);

create index character_vip_groups_character_id_idx
  on character_vip_groups(character_id);

alter table character_vip_groups enable row level security;

alter table character_vips
  add column group_id uuid references character_vip_groups(id)
    on delete set null;

create table character_social_settings (
  character_id uuid primary key references characters(id) on delete cascade,
  finder_visible boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table character_social_settings enable row level security;
