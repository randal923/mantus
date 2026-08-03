-- 007 capped stored health and mana at 100000, a number that comfortably
-- covered the level-1000 ceiling of the time. 070 lifted MAX_CHARACTER_LEVEL
-- to 50000 but left these two behind, so any character whose pool passed
-- 100000 could no longer be saved at all: a level-5000 sorcerer (max mana
-- 150025) failed every persist with `characters_mana_upper_bound`, which
-- surfaced as "potion persist failed" followed by a cache resync.
--
-- Re-derived from `deriveCharacterStats` at MAX_CHARACTER_LEVEL = 50000, the
-- worst vocation for each pool: health 750135 (Knight), mana 1500025
-- (Sorcerer/Druid). The bound below leaves better than 3x headroom for the
-- equipment, imbuement, and wheel bonuses that stack on top, while still
-- catching a corrupt write. Re-derive both if the level ceiling moves again —
-- `characterStatBounds.test.ts` fails when they stop covering the peak.
alter table characters
  drop constraint if exists characters_health_upper_bound;
alter table characters
  add constraint characters_health_upper_bound check (health <= 5000000);

alter table characters
  drop constraint if exists characters_mana_upper_bound;
alter table characters
  add constraint characters_mana_upper_bound check (mana <= 5000000);
