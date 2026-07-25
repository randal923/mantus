import type { CharacterVocation } from "@tibia/protocol";
import type {
  ProfileSnapshot,
  ProfileStore,
  PublicProfileRecord,
} from "./ProfileStore";

interface MemoryCharacter {
  readonly name: string;
  readonly level: number;
  readonly vocation: CharacterVocation;
}

/**
 * In-memory ProfileStore mirroring the Pg store's semantics: grants are
 * set-inserts (so a repeat grant reports `granted: false`), title selection
 * only accepts a granted title, and bug reports honour the daily cap.
 */
export class MemoryProfileStore implements ProfileStore {
  private readonly characters = new Map<string, MemoryCharacter>();
  private readonly achievements = new Map<string, Set<string>>();
  private readonly titles = new Map<string, Set<string>>();
  private readonly badges = new Map<string, Set<string>>();
  private readonly selectedTitles = new Map<string, string | null>();
  private readonly bugReports = new Map<string, number>();

  registerCharacter(
    characterId: string,
    name: string,
    level = 1,
    vocation: CharacterVocation = "Knight",
  ): void {
    this.characters.set(characterId, { name, level, vocation });
  }

  async loadSnapshot(characterId: string): Promise<ProfileSnapshot> {
    return {
      achievements: [...(this.achievements.get(characterId) ?? [])].sort(),
      titles: [...(this.titles.get(characterId) ?? [])].sort(),
      badges: [...(this.badges.get(characterId) ?? [])].sort(),
      selectedTitle: this.selectedTitles.get(characterId) ?? null,
    };
  }

  async grantAchievement(input: {
    characterId: string;
    achievementId: string;
    titleId?: string;
  }): Promise<{ granted: boolean }> {
    const owned =
      this.achievements.get(input.characterId) ?? new Set<string>();
    const granted = !owned.has(input.achievementId);
    owned.add(input.achievementId);
    this.achievements.set(input.characterId, owned);
    if (input.titleId) {
      const titles = this.titles.get(input.characterId) ?? new Set<string>();
      titles.add(input.titleId);
      this.titles.set(input.characterId, titles);
    }
    return { granted };
  }

  async grantBadge(input: {
    characterId: string;
    badgeId: string;
  }): Promise<{ granted: boolean }> {
    const owned = this.badges.get(input.characterId) ?? new Set<string>();
    const granted = !owned.has(input.badgeId);
    owned.add(input.badgeId);
    this.badges.set(input.characterId, owned);
    return { granted };
  }

  async selectTitle(input: {
    characterId: string;
    titleId: string | null;
  }): Promise<{ status: "ok" } | { status: "failed"; reason: "not-granted" }> {
    if (
      input.titleId !== null &&
      !this.titles.get(input.characterId)?.has(input.titleId)
    ) {
      return { status: "failed", reason: "not-granted" };
    }
    this.selectedTitles.set(input.characterId, input.titleId);
    return { status: "ok" };
  }

  async loadPublicProfile(
    normalizedName: string,
  ): Promise<PublicProfileRecord | null> {
    const entry = [...this.characters.entries()].find(
      ([, character]) =>
        character.name.trim().toLowerCase() === normalizedName.trim().toLowerCase(),
    );
    if (!entry) return null;
    const [characterId, character] = entry;
    return {
      characterId,
      name: character.name,
      level: character.level,
      vocation: character.vocation,
      selectedTitle: this.selectedTitles.get(characterId) ?? null,
      achievements: [...(this.achievements.get(characterId) ?? [])].sort(),
      badges: [...(this.badges.get(characterId) ?? [])].sort(),
    };
  }

  async createBugReport(input: {
    characterId: string;
    category: string;
    message: string;
    position: { x: number; y: number; z: number };
    maxPerDay: number;
  }): Promise<
    { status: "created" } | { status: "failed"; reason: "rate-limited" }
  > {
    const sent = this.bugReports.get(input.characterId) ?? 0;
    if (sent >= input.maxPerDay) {
      return { status: "failed", reason: "rate-limited" };
    }
    this.bugReports.set(input.characterId, sent + 1);
    return { status: "created" };
  }
}
