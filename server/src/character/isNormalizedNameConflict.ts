export function isNormalizedNameConflict(cause: unknown): boolean {
  if (!cause || typeof cause !== "object") return false;
  return (
    "code" in cause &&
    cause.code === "23505" &&
    "constraint" in cause &&
    cause.constraint === "characters_normalized_name_key"
  );
}
