-- Unique rarity-item sales record their grade so price statistics can keep
-- attributed fills out of the plain per-type average.
alter table market_history
  add column rarity text
  check (rarity is null or rarity in ('uncommon', 'rare', 'epic', 'legendary'));
