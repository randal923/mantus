/** True for Postgres serialization/deadlock aborts that are safe to retry. */
export function isSerializationFailure(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null) return false;
  const code = (cause as { code?: unknown }).code;
  return code === "40001" || code === "40P01";
}
