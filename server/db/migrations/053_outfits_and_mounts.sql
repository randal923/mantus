-- Outfit/addon and mount entitlements (todo 16, Features 70 and 71).
--
-- Until now a character's look type was pinned to the two starter citizen
-- outfits by a column check, which is why nothing could be forged: there was
-- nothing to choose. Making outfits selectable means the *entitlement* has to
-- become the gate, so the column check widens to the sprite range and every
-- selection is validated against these rows at execution time before the
-- outfit reaches any creature projection (charter rules 1 and 4).
--
-- Addons are stored per outfit as a 2-bit mask, exactly as Canary does, so
-- "owns the outfit" and "owns its addons" are one row rather than two states
-- that can disagree.
--
-- A mount also carries a server-side speed bonus, so `characters.mount_id` is
-- the authority the movement code reads — never anything a client sends.

create table character_outfits (
  character_id uuid not null references characters(id) on delete cascade,
  look_type integer not null check (look_type between 1 and 65535),
  addons smallint not null default 0 check (addons between 0 and 3),
  granted_at timestamptz not null default now(),
  primary key (character_id, look_type)
);

alter table character_outfits enable row level security;

create table character_mounts (
  character_id uuid not null references characters(id) on delete cascade,
  mount_id integer not null check (mount_id between 1 and 65535),
  granted_at timestamptz not null default now(),
  primary key (character_id, mount_id)
);

alter table character_mounts enable row level security;

alter table characters
  add column mount_id integer not null default 0
    check (mount_id between 0 and 65535);

alter table characters
  drop constraint characters_outfit_look_type_check,
  add constraint characters_outfit_look_type_check
    check (outfit_look_type between 1 and 65535);
