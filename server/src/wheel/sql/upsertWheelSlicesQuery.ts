export const upsertWheelSlicesQuery = `
INSERT INTO character_wheel (character_id, slices, updated_at)
VALUES ($1, $2, now())
ON CONFLICT (character_id)
DO UPDATE SET slices = EXCLUDED.slices, updated_at = now()
`;
