import type {
  Character,
  CharacterSaveSnapshot,
  CharacterSummary,
} from "./Character";

export interface CharacterStore {
  listByAccountId(accountId: string): Promise<CharacterSummary[]>;
  create(character: Character, maxCharacters: number): Promise<Character>;
  loadForLogin(
    accountId: string,
    characterId: string,
    loggedInAt: Date,
  ): Promise<Character | null>;
  saveSnapshot(snapshot: CharacterSaveSnapshot): Promise<number>;
}
