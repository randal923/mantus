import { PROTOCOL_LIMITS } from "@tibia/protocol";

const RESERVED_WORDS = new Set([
  "admin",
  "administrator",
  "gamemaster",
  "gm",
  "god",
  "mantus",
  "moderator",
  "staff",
  "support",
  "tutor",
]);

interface NormalizedCharacterName {
  displayName: string;
  normalizedName: string;
}

export function normalizeCharacterName(
  input: string,
): NormalizedCharacterName | null {
  const displayName = input.trim().replace(/\s+/g, " ");
  if (
    displayName.length < PROTOCOL_LIMITS.minCharacterNameLength ||
    displayName.length > PROTOCOL_LIMITS.maxCharacterNameLength ||
    !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(displayName)
  ) {
    return null;
  }
  const normalizedName = displayName.toLowerCase();
  const words = normalizedName.split(" ");
  if (
    words.some((word) => RESERVED_WORDS.has(word)) ||
    normalizedName === "game master" ||
    normalizedName === "community manager"
  ) {
    return null;
  }
  return { displayName, normalizedName };
}
