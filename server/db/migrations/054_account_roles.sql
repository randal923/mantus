-- Role-authorized admin tooling (todo 18, Feature 96).
--
-- The moderation runtime already writes an audited row in the same transaction
-- that changes state, but reaching it required DEV_COMMANDS=1 (never enabled in
-- production) or the coarse `is_staff` boolean from migration 050. Neither is
-- authorization: staff is one bit, so a tutor who may mute could also ban.
--
-- This adds the per-account role every admin path authorizes against. The role
-- is read from the session's own authenticated account at execution time and
-- never from anything a client message names (charter rule 9).

create type account_role as enum ('player', 'tutor', 'gamemaster', 'admin');

alter table accounts add column role account_role not null default 'player';

-- Backfill: whoever was flagged staff keeps exactly the reach they had today.
update accounts set role = 'gamemaster' where is_staff;

-- One truth. `is_staff` was the narrow forward-compatible piece migration 050
-- added for highscore exclusion, with an explicit note to derive it from the
-- role once this landed. Making it generated means the two cannot drift, and
-- every existing highscore query and its partial index keep working unchanged.
drop index accounts_is_staff_idx;
alter table accounts drop column is_staff;
alter table accounts
  add column is_staff boolean
  generated always as (role <> 'player') stored;
create index accounts_is_staff_idx on accounts(id) where is_staff;

-- Admin actions beyond moderation land in the same durable audit trail, so
-- there is one place to answer "what did staff do".
alter table moderation_actions drop constraint moderation_actions_action_check;
alter table moderation_actions add constraint moderation_actions_action_check
  check (
    action in (
      'mute', 'unmute', 'kick', 'ban', 'unban', 'note', 'namelock',
      'teleport', 'inspect'
    )
  );

-- Before/after state for actions whose effect `duration_ms` cannot express
-- (a teleport's origin and destination, an inspection's subject).
alter table moderation_actions add column detail jsonb;
