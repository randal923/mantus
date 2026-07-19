/** Matches the DB's normalized unique index: lower(btrim(name)). */
export function normalizeGuildName(name: string): string {
  return name.trim().toLowerCase();
}
