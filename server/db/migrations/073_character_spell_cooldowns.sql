-- Spell cooldowns that survive a relog (Feature 79-81 follow-up).
-- Session.combatCooldowns was memory-only, which was harmless while the
-- longest cooldown was 30 minutes but became an exploit once the Wheel of
-- Destiny avatars shipped with 1-2 h cooldowns: relogging reset them.
-- Rows are written as a full replace when the session leaves the world and
-- read once at login; ready_at is epoch milliseconds from the server clock,
-- the same convention as prey's free_reroll_at (migration 055).
-- Keys are the fight-state cooldown keys: spell:<id>, group:<name>, potion.

create table character_spell_cooldowns (
  character_id uuid not null references characters(id) on delete cascade,
  cooldown_key varchar(128) not null,
  ready_at bigint not null check (ready_at >= 0),
  -- The protocol caps a cooldown at two hours (the avatars' base).
  total_ms integer not null check (total_ms > 0 and total_ms <= 7200000),
  primary key (character_id, cooldown_key)
);

alter table character_spell_cooldowns enable row level security;
