-- Character sex (Feature 70 follow-up).
--
-- A look type belongs to exactly one sex in Tibia's catalog, so "which outfits
-- may this character ever wear" is decided by a column the client cannot
-- touch, chosen once at creation. Canary's PlayerSex_t is used verbatim:
-- 0 = female, 1 = male.
--
-- Characters created before this column existed are all made male, and any of
-- them still wearing the female citizen outfit is moved to the male one so the
-- worn look type and the sex cannot disagree. Entitlement rows of the wrong
-- sex are simply never listed or selectable (the catalog check rejects them),
-- so no row surgery is needed here.

alter table characters
  add column sex smallint not null default 1 check (sex in (0, 1));

-- The addon bits belonged to the female citizen; the male one is a starter
-- outfit every character owns, but its addons are not, so they reset.
update characters
set outfit_look_type = 128, outfit_addons = 0
where outfit_look_type = 136;
