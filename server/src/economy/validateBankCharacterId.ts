export function validateBankCharacterId(characterId: string): void {
  if (characterId.length === 0 || characterId.length > 128) {
    throw new Error("invalid bank character id");
  }
}
