-- Account-wide fight controls. The game server validates every incoming mode
-- through the protocol schema before persisting it; this constraint provides
-- defense in depth for direct database writes.
alter table accounts
  add column if not exists fight_mode jsonb not null default
    '{"attack":"offensive","chase":false,"secure":true}'::jsonb;

alter table accounts drop constraint if exists accounts_fight_mode_valid;
alter table accounts
  add constraint accounts_fight_mode_valid
  check (
    jsonb_typeof(fight_mode) = 'object'
    and fight_mode ?& array['attack', 'chase', 'secure']
    and fight_mode - array['attack', 'chase', 'secure'] = '{}'::jsonb
    and fight_mode->>'attack' in ('offensive', 'balanced', 'defensive')
    and fight_mode->'chase' in ('true'::jsonb, 'false'::jsonb)
    and fight_mode->'secure' in ('true'::jsonb, 'false'::jsonb)
  );
