/** True when `cause` is a Postgres unique violation, optionally on one index. */
export function isUniqueViolation(cause: unknown, constraint?: string): boolean {
  if (typeof cause !== "object" || cause === null) return false;
  const error = cause as { code?: unknown; constraint?: unknown };
  if (error.code !== "23505") return false;
  return constraint === undefined || error.constraint === constraint;
}
