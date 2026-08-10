const TRANSIENT_POSTGRES_CODES = new Set([
  "40001",
  "40P01",
  "53300",
  "57P01",
  "57P02",
  "57P03",
]);

const TRANSIENT_SYSTEM_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETRESET",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
]);

export function isTransientDatabaseError(cause: unknown): boolean {
  if (!cause || typeof cause !== "object") return false;
  // Supavisor reports pooler saturation (EMAXCONNSESSION and friends) as a
  // generic XX000, so match the message: a save burst should back off and
  // retry, not fail the character.
  if (
    "message" in cause &&
    typeof cause.message === "string" &&
    cause.message.includes("max clients reached")
  ) {
    return true;
  }
  if (!("code" in cause)) return false;
  return (
    typeof cause.code === "string" &&
    (cause.code.startsWith("08") ||
      TRANSIENT_POSTGRES_CODES.has(cause.code) ||
      TRANSIENT_SYSTEM_CODES.has(cause.code))
  );
}
