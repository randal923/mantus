export function parseStorageValues(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("character storage values are invalid");
  }
  const parsed: Record<string, number> = {};
  for (const [key, storageValue] of Object.entries(value)) {
    if (
      key.length < 1 ||
      key.length > 192 ||
      typeof storageValue !== "number" ||
      !Number.isInteger(storageValue) ||
      storageValue < -2_147_483_648 ||
      storageValue > 2_147_483_647
    ) {
      throw new Error("character storage value is invalid");
    }
    parsed[key] = storageValue;
  }
  return parsed;
}
