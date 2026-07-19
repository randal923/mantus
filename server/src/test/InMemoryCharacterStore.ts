import type { ActionBar } from "@tibia/protocol";
import type {
  Character,
  CharacterSaveSnapshot,
  CharacterSummary,
} from "../character/Character";
import { CharacterError } from "../character/CharacterError";
import type { CharacterStore } from "../character/CharacterStore";

export class InMemoryCharacterStore implements CharacterStore {
  private readonly characters = new Map<string, Character>();

  seed(character: Character): void {
    this.characters.set(character.id, character);
  }

  positionFor(characterId: string): { x: number; y: number; z: number } | null {
    const character = this.characters.get(characterId);
    if (!character) return null;
    return {
      x: character.positionX,
      y: character.positionY,
      z: character.positionZ,
    };
  }

  lastLoginFor(characterId: string): Date | null {
    return this.characters.get(characterId)?.lastLoginAt ?? null;
  }

  async listByAccountId(accountId: string): Promise<CharacterSummary[]> {
    return [...this.characters.values()]
      .filter((character) => character.accountId === accountId)
      .map((character) => ({
        id: character.id,
        displayName: character.displayName,
        vocation: character.vocation,
        level: character.level,
        outfit: character.outfit,
        lastLoginAt: character.lastLoginAt,
      }));
  }

  async create(character: Character, maxCharacters: number): Promise<Character> {
    const roster = [...this.characters.values()].filter(
      (existing) => existing.accountId === character.accountId,
    );
    if (roster.length >= maxCharacters) {
      throw new CharacterError("limit-reached");
    }
    if (
      [...this.characters.values()].some(
        (existing) => existing.normalizedName === character.normalizedName,
      )
    ) {
      throw new CharacterError("name-taken");
    }
    this.characters.set(character.id, character);
    return character;
  }

  async findByIdForAccount(
    accountId: string,
    characterId: string,
  ): Promise<Character | null> {
    const character = this.characters.get(characterId);
    if (!character || character.accountId !== accountId) return null;
    return character;
  }

  async recordLogin(
    accountId: string,
    characterId: string,
    loggedInAt: Date,
  ): Promise<void> {
    const character = this.characters.get(characterId);
    if (!character || character.accountId !== accountId) {
      throw new CharacterError("not-found");
    }
    this.characters.set(characterId, { ...character, lastLoginAt: loggedInAt });
  }

  async updateActionBar(
    characterId: string,
    actionBar: ActionBar,
  ): Promise<void> {
    const character = this.characters.get(characterId);
    if (!character) throw new CharacterError("not-found");
    this.characters.set(characterId, {
      ...character,
      actionBar,
      updatedAt: new Date(),
    });
  }

  async saveSnapshot(snapshot: CharacterSaveSnapshot): Promise<number> {
    const character = this.characters.get(snapshot.characterId);
    if (!character || character.version !== snapshot.expectedVersion) {
      throw new CharacterError("version-conflict");
    }
    const version = character.version + 1;
    this.characters.set(snapshot.characterId, {
      ...character,
      level: snapshot.level,
      experience: snapshot.experience,
      magicLevel: snapshot.magicLevel,
      manaSpent: snapshot.manaSpent,
      health: snapshot.health,
      mana: snapshot.mana,
      soul: snapshot.soul,
      skills: snapshot.skills,
      progressionEventIds: [
        ...character.progressionEventIds,
        ...snapshot.progressionEvents.map((event) => event.id),
      ],
      positionX: snapshot.positionX,
      positionY: snapshot.positionY,
      positionZ: snapshot.positionZ,
      direction: snapshot.direction,
      outfit: snapshot.outfit,
      skull: snapshot.skull,
      skullExpiresAt: snapshot.skullExpiresAt,
      version,
      updatedAt: new Date(),
    });
    return version;
  }
}
