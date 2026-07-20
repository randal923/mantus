export const selectWheelSlicesQuery = `
SELECT slices
FROM character_wheel
WHERE character_id = $1
`;
