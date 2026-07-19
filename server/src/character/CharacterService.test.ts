import { describe, expect, it } from "vitest";
import { clientMessageSchema } from "@tibia/protocol";
import type {
  Character,
  CharacterSaveSnapshot,
  CharacterSummary,
} from "./Character";
import { CharacterError } from "./CharacterError";
import { CharacterService } from "./CharacterService";
import type { CharacterStore } from "./CharacterStore";

class MemoryCharacterStore implements CharacterStore {
  private readonly characters = new Map<string, Character>();

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
    const accountCount = [...this.characters.values()].filter(
      (existing) => existing.accountId === character.accountId,
    ).length;
    if (accountCount >= maxCharacters) {
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
      version,
      updatedAt: new Date(),
    });
    return version;
  }

  async updateActionBar(
    characterId: string,
    actionBar: Character["actionBar"],
  ): Promise<void> {
    const character = this.characters.get(characterId);
    if (!character) throw new CharacterError("not-found");
    this.characters.set(characterId, { ...character, actionBar });
  }
}

const makeService = () =>
  new CharacterService(new MemoryCharacterStore(), {
    x: 100,
    y: 200,
    z: 7,
    townId: 1,
  });

describe("CharacterService", () => {
  it("allows only one account to claim the same normalized name", async () => {
    const service = makeService();
    const results = await Promise.allSettled([
      service.create("account-a", {
        displayName: "Alice",
        vocation: "Knight",
        lookType: 128,
      }),
      service.create("account-b", {
        displayName: "  ALICE  ",
        vocation: "Druid",
        lookType: 136,
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toMatchObject({ code: "name-taken" });
    }
  });

  it("enforces the per-account character limit in the service", async () => {
    const service = makeService();
    for (const name of ["Alicia", "Bianca", "Celina", "Daria", "Elena"]) {
      await service.create("account-a", {
        displayName: name,
        vocation: "Knight",
        lookType: 128,
      });
    }

    await expect(
      service.create("account-a", {
        displayName: "Fiona",
        vocation: "Knight",
        lookType: 128,
      }),
    ).rejects.toMatchObject({ code: "limit-reached" });
    await expect(service.list("account-a")).resolves.toHaveLength(5);
  });

  it("rejects reserved staff names", async () => {
    const service = makeService();

    await expect(
      service.create("account-a", {
        displayName: "Game Master",
        vocation: "Knight",
        lookType: 128,
      }),
    ).rejects.toMatchObject({ code: "name-invalid" });
  });

  it("rejects forged starter state and unadvertised choices at the schema boundary", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "create-character",
        name: "Mallory",
        vocation: "Knight",
        lookType: 128,
        health: 999999,
        x: 1,
        outfitHead: 999,
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "create-character",
        name: "Mallory",
        vocation: "Assassin",
        lookType: 999,
      }).success,
    ).toBe(false);
  });
});
