export type CharacterErrorCode =
  | "limit-reached"
  | "name-invalid"
  | "name-taken"
  | "not-found"
  | "version-conflict";

export class CharacterError extends Error {
  constructor(readonly code: CharacterErrorCode) {
    super(code);
  }
}
