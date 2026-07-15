import type {
  Character,
  CharacterSaveSnapshot,
  CharacterSummary,
} from "./Character";

export interface CharacterStore {
  listByAccountId(accountId: string): Promise<CharacterSummary[]>;
  create(character: Character, maxCharacters: number): Promise<Character>;
  findByIdForAccount(
    accountId: string,
    characterId: string,
  ): Promise<Character | null>;
  recordLogin(
    accountId: string,
    characterId: string,
    loggedInAt: Date,
  ): Promise<void>;
  saveSnapshot(snapshot: CharacterSaveSnapshot): Promise<number>;
}
