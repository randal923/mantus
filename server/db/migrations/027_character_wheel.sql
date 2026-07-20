CREATE TABLE character_wheel (
  character_id uuid PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  slices smallint[] NOT NULL
    CHECK (cardinality(slices) = 36)
    CHECK (0 <= ALL (slices))
    CHECK (200 >= ALL (slices)),
  updated_at timestamptz NOT NULL DEFAULT now()
);
