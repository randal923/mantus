-- Durable world events: raids, global events, boosted rotations (todo 14,
-- Feature 54).
--
-- Two tables, both driven by the database clock rather than server uptime, so
-- a restart cannot replay a fire or skip a boundary:
--
--   * world_event_schedules — one row per imported event id. `next_check_at`
--     IS the lease: claiming is a single conditional UPDATE guarded by
--     `next_check_at <= now()` that advances the deadline in the same
--     statement, so two managers racing one schedule see exactly one winner
--     and the loser observes the advanced deadline. The Canary roll state
--     (failed attempts, checks today, last occurrence) lives here too, so it
--     survives a restart exactly as Canary's KV does.
--
--   * world_event_runs — one row per fire, keyed by an idempotency key derived
--     from the event id and the claimed check. Inserting it is
--     ON CONFLICT DO NOTHING, so a retried or replayed fire produces no second
--     run and therefore no second wave of spawns or rewards. A run interrupted
--     by a restart is marked 'abandoned' at startup and never resumed —
--     matching Canary, where a restart ends an in-flight raid.
create table world_event_schedules (
  event_id varchar(128) primary key,
  next_check_at timestamptz not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  checks_today integer not null default 0 check (checks_today >= 0),
  checks_day date,
  last_occurrence_at timestamptz,
  trigger_when_possible boolean not null default false,
  enabled boolean not null default true
);

create index world_event_schedules_next_check_at_idx
  on world_event_schedules(next_check_at)
  where enabled;

create table world_event_runs (
  idempotency_key varchar(192) primary key,
  event_id varchar(128) not null
    references world_event_schedules(event_id) on delete cascade,
  trigger text not null check (trigger in ('schedule', 'operator')),
  operator_character_id uuid references characters(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'completed', 'abandoned'))
);

create index world_event_runs_event_id_started_at_idx
  on world_event_runs(event_id, started_at desc);

alter table world_event_schedules enable row level security;
alter table world_event_runs enable row level security;

alter table audit_log
  drop constraint audit_log_event_type_check,
  add constraint audit_log_event_type_check check (
    event_type in (
      'item-created',
      'item-destroyed',
      'item-transferred',
      'item-split',
      'item-merged',
      'item-transformed',
      'item-written',
      'world-item-seeded',
      'npc-travel',
      'bank-deposit',
      'bank-withdraw',
      'bank-transfer',
      'shop-purchase',
      'shop-sale',
      'market-offer-created',
      'market-offer-accepted',
      'market-offer-cancelled',
      'market-offer-expired',
      'pvp-skull-sanction',
      'house-purchase',
      'house-transfer',
      'house-rent',
      'house-eviction',
      'gem-reveal',
      'gem-destroy',
      'gem-switch-domain',
      'gem-grade-improve',
      'vocation-promotion',
      'spell-purchase',
      'store-purchase',
      'store-grant',
      'store-refund',
      'chest-loot',
      'world-event-started',
      'world-event-operator'
    )
  );
