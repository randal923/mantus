CREATE TABLE character_storages (
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  storage_key varchar(192) NOT NULL,
  storage_value integer NOT NULL,
  PRIMARY KEY (character_id, storage_key)
);
