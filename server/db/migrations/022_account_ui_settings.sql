-- Account-wide client UI preferences (panel layouts etc.). The server
-- validates the shape against the protocol uiSettingsSchema before writing;
-- the size cap is defense in depth against oversized blobs.
alter table accounts
  add column if not exists ui_settings jsonb not null default '{}'::jsonb;

alter table accounts drop constraint if exists accounts_ui_settings_size;
alter table accounts
  add constraint accounts_ui_settings_size
  check (pg_column_size(ui_settings) <= 4096);
