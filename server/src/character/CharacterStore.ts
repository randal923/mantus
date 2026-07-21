import type { ActionBar, PotionActionBar } from "@tibia/protocol";
import type {
  Character,
  CharacterSaveSnapshot,
  CharacterSummary,
} from "./Character";
import type { StarterSet } from "../item/StarterSet";

export interface CharacterStore {
  listByAccountId(accountId: string): Promise<CharacterSummary[]>;
  create(
    character: Character,
    maxCharacters: number,
    starterSet: StarterSet,
  ): Promise<Character>;
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
  updateActionBar(characterId: string, actionBar: ActionBar): Promise<void>;
  updatePotionActionBar(
    characterId: string,
    potionActionBar: PotionActionBar,
  ): Promise<void>;
}
