-- There is no level cap, and there never should have been one here.
--
-- Canary bounds none of this: `level` is a uint32_t, `experience` a uint64_t,
-- and its schema.sql declares `level int(11)` / `experience bigint(20)` with no
-- CHECK at all. Ours carried four upper bounds that were really restatements of
-- whatever the level ceiling happened to be when they were written, and each
-- one became a wall the game could walk into: 007's `mana <= 100000` meant a
-- level-5000 sorcerer (150025 max mana) could not be saved at all, every
-- persist failing the constraint mid-fight.
--
-- The column types are the limit now, as in Canary: `integer` for level,
-- health, and mana; `bigint` for experience, which the server carries end to
-- end as a bigint and serialises as a decimal string. Lower bounds stay —
-- they catch sign errors and cost nothing. `characterStatBounds.test.ts` fails
-- if an upper bound comes back.
alter table characters
  drop constraint if exists characters_level_check;
alter table characters
  add constraint characters_level_check check (level >= 1);

alter table characters
  drop constraint if exists characters_experience_check;
alter table characters
  add constraint characters_experience_check check (experience >= 0);

alter table characters
  drop constraint if exists characters_health_upper_bound;
alter table characters
  add constraint characters_health_upper_bound check (health >= 0);

alter table characters
  drop constraint if exists characters_mana_upper_bound;
alter table characters
  add constraint characters_mana_upper_bound check (mana >= 0);
