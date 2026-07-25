-- Staff flag for social-services hardening (todo 15, Feature 66).
--
-- Highscores are a public read model, and Canary keeps staff characters out
-- of every board. That needs a durable notion of "staff", which the admin
-- role work (Feature 96) will own in full. This is the narrow, forward
-- compatible piece it needs today: one boolean on the account, so every
-- character of a staff account is excluded at query time rather than through
-- a per-character opt-out somebody could forget.
--
-- When Feature 96 lands its role column, derive this from it (or replace the
-- highscore filter with the role check) rather than maintaining two truths.

alter table accounts
  add column is_staff boolean not null default false;

-- Partial index: the flag is false for essentially every row, so the boards'
-- anti-join only has to look at the handful that are true.
create index accounts_is_staff_idx on accounts(id) where is_staff;
