export type CharacterErrorCode =
  | "limit-reached"
  | "name-invalid"
  | "name-taken"
  | "not-found"
  | "version-conflict"
  | "guild-leader"
  | "house-owner"
  | "house-auction"
  | "market-offers";

export class CharacterError extends Error {
  constructor(readonly code: CharacterErrorCode) {
    super(code);
  }
}
