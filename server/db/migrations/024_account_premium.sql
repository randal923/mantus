alter table accounts
  add column if not exists premium_until timestamptz;
