CREATE TABLE character_bestiary_kills (
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  race_id integer NOT NULL CHECK (race_id > 0),
  kills bigint NOT NULL DEFAULT 0 CHECK (kills >= 0),
  PRIMARY KEY (character_id, race_id)
);
