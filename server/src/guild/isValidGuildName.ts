import { GUILD_LIMITS } from "@tibia/protocol";

const NAME_PATTERN = /^[A-Za-z]+( [A-Za-z]+)*$/;

/** Letters with single spaces, 3–29 chars (mirrors the DB check). */
export function isValidGuildName(name: string): boolean {
  const trimmed = name.trim();
  return (
    trimmed.length >= GUILD_LIMITS.minNameLength &&
    trimmed.length <= GUILD_LIMITS.maxNameLength &&
    NAME_PATTERN.test(trimmed)
  );
}
