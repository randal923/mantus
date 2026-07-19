-- Moderation (todo 14e): the durable moderation audit trail plus the fast
-- lookup tables enforcement reads. Every applied moderation action writes a
-- moderation_actions row in the same transaction that changes state, so the
-- trail cannot drift from what was actually enforced. Bans are keyed to
-- accounts (login is per account); accounts.banned_until stays the single
-- value the auth path checks and is updated in the same transaction as the
-- account_bans metadata row.

create table moderation_actions (
  id uuid primary key default gen_random_uuid(),
  action text not null check (
    action in ('mute', 'unmute', 'kick', 'ban', 'unban', 'note', 'namelock')
  ),
  target_character_id uuid references characters(id) on delete set null,
  -- Null when issued by the system (e.g. automated enforcement).
  issued_by_character_id uuid references characters(id) on delete set null,
  reason varchar(255) not null default '',
  duration_ms bigint check (duration_ms between 0 and 9007199254740991),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index moderation_actions_target_idx
  on moderation_actions(target_character_id, created_at desc);

alter table moderation_actions enable row level security;

create table character_mutes (
  character_id uuid primary key references characters(id) on delete cascade,
  muted_until timestamptz not null,
  reason varchar(255) not null default ''
);

alter table character_mutes enable row level security;

create table account_bans (
  account_id uuid primary key references accounts(id) on delete cascade,
  reason varchar(255) not null default '',
  banned_at timestamptz not null default now(),
  expires_at timestamptz,
  banned_by_character_id uuid references characters(id) on delete set null
);

alter table account_bans enable row level security;

create table player_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_character_id uuid not null references characters(id) on delete cascade,
  target_character_id uuid references characters(id) on delete set null,
  target_name varchar(20) not null,
  reason text not null check (
    reason in ('name', 'cheating', 'botting', 'abuse', 'other')
  ),
  comment varchar(500) not null default '',
  status text not null default 'open' check (
    status in ('open', 'reviewed', 'dismissed')
  ),
  created_at timestamptz not null default now()
);

create index player_reports_reporter_created_at_idx
  on player_reports(reporter_character_id, created_at desc);
create index player_reports_status_idx
  on player_reports(status, created_at desc);

alter table player_reports enable row level security;
