-- Game-owned tables. Supabase's auth schema stays untouched; we key our
-- accounts on the Supabase user id from the verified JWT.
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  supabase_user_id text not null unique,
  email text,
  created_at timestamptz not null default now(),
  banned_until timestamptz
);

-- RLS with no policies: denies all Data API (PostgREST) access. Our game
-- server connects as the table owner, which RLS does not restrict.
alter table accounts enable row level security;
