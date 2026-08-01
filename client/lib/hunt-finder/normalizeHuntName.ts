export function normalizeHuntName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en");
}
