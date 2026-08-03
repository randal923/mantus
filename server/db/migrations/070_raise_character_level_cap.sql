-- 007 pinned the character level ceiling at 1000 and the experience ceiling
-- at getExperienceForLevel(1000) = 16566949800. The ceiling is being lifted
-- to 50000, matching MAX_CHARACTER_LEVEL in protocol/src/progression.ts.
--
-- 50000 is not a gameplay choice: every experience path in the server checks
-- Number.isSafeInteger, and getExperienceForLevel stops producing exact
-- values above level 81456 (its experience passes Number.MAX_SAFE_INTEGER),
-- so the ceiling stays well clear of that. The bound below is
-- getExperienceForLevel(50000); it must be re-derived if the constant moves
-- again, since assertValidCharacterSaveSnapshot rejects any experience above
-- getExperienceForLevel(MAX_CHARACTER_LEVEL) and the two must agree.
alter table characters
  drop constraint if exists characters_level_check;
alter table characters
  add constraint characters_level_check
  check (level between 1 and 50000);

alter table characters
  drop constraint if exists characters_experience_check;
alter table characters
  add constraint characters_experience_check
  check (experience between 0 and 2083083347499800);
