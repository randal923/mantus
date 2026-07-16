create table audit_log (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  event_type text not null check (
    event_type in (
      'item-created',
      'item-destroyed',
      'item-transferred',
      'item-split',
      'item-merged',
      'item-transformed',
      'world-item-seeded'
    )
  ),
  character_id uuid references characters(id) on delete set null,
  item_id uuid,
  details jsonb not null default '{}'::jsonb check (
    jsonb_typeof(details) = 'object'
    and octet_length(details::text) <= 4096
  )
);

create index audit_log_character_id_occurred_at_idx
  on audit_log(character_id, occurred_at desc);
create index audit_log_item_id_occurred_at_idx
  on audit_log(item_id, occurred_at desc);

alter table audit_log enable row level security;
