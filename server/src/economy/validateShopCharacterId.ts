export function validateShopCharacterId(characterId: string): void {
  if (characterId.length === 0 || characterId.length > 128) {
    throw new Error("invalid shop character id");
  }
}
