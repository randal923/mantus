alter table accounts
  add column if not exists language text not null default 'en'
  check (language in ('en', 'pt-BR'));
