-- Feature 18: persistent stamina plus the durable "last seen" anchor that
-- offline stamina regeneration and offline training measure against.
--
-- Stamina is stored in minutes (Canary: 0..2520, 2520 = 42h, the start value).
-- last_seen_at is the app wall-clock time of the last durable save; the next
-- login computes offline time as (login clock - last_seen_at). Because every
-- save advances it, a manipulated client clock or an immediate reconnect
-- cannot manufacture offline accrual (charter rule 8: server clock is real).
alter table characters
  add column stamina smallint not null default 2520
    check (stamina between 0 and 2520),
  add column last_seen_at timestamptz not null default now();
