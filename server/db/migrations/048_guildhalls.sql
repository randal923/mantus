-- Guildhall ownership (todo 15, Feature 63).
--
-- A guildhall is a house owned *by a guild*: the row still records the leader
-- who bought it (so every existing owner-scoped path keeps working) but the
-- money legs — purchase and rent — go through the guild balance instead of
-- the leader's bank account.
--
-- The one-house-per-character unique index becomes partial so a leader's
-- personal house and their guild's hall do not collide, and a new partial
-- unique index enforces one guildhall per guild against racing purchases.
-- `on delete restrict` keeps a guild disband from silently orphaning a hall.

alter table houses
  add column guild_id uuid references guilds(id) on delete restrict;

drop index houses_owner_character_id_idx;

create unique index houses_owner_character_id_idx
  on houses(owner_character_id) where guild_id is null;

create unique index houses_guild_id_idx
  on houses(guild_id) where guild_id is not null;

alter table guild_bank_ledger
  drop constraint guild_bank_ledger_entry_type_check,
  add constraint guild_bank_ledger_entry_type_check check (
    entry_type in (
      'deposit',
      'withdraw',
      'war-stake',
      'war-payout',
      'war-refund',
      'guildhall-purchase',
      'guildhall-rent'
    )
  );
