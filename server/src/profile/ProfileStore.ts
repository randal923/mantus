import type { CharacterVocation } from "@tibia/protocol";

/** Everything the owner may see about their own profile. */
export interface ProfileSnapshot {
  readonly achievements: ReadonlyArray<string>;
  readonly titles: ReadonlyArray<string>;
  readonly badges: ReadonlyArray<string>;
  readonly selectedTitle: string | null;
}

/** The public read model behind `character-profile`. */
export interface PublicProfileRecord {
  readonly characterId: string;
  readonly name: string;
  readonly level: number;
  readonly vocation: CharacterVocation;
  readonly selectedTitle: string | null;
  readonly achievements: ReadonlyArray<string>;
  readonly badges: ReadonlyArray<string>;
}

/**
 * Durable profile grants. Every grant is idempotent by primary key, so the
 * same progression event delivered twice — or two systems granting the same
 * achievement concurrently — leaves exactly one row; `granted` reports
 * whether *this* call was the one that created it, which is what makes the
 * "achievement unlocked" push exactly-once too.
 */
export interface ProfileStore {
  loadSnapshot(characterId: string): Promise<ProfileSnapshot>;
  grantAchievement(input: {
    characterId: string;
    achievementId: string;
    titleId?: string;
  }): Promise<{ granted: boolean }>;
  grantBadge(input: {
    characterId: string;
    badgeId: string;
  }): Promise<{ granted: boolean }>;
  /** Fails when the title was never granted; never trusts the client's id. */
  selectTitle(input: {
    characterId: string;
    titleId: string | null;
  }): Promise<{ status: "ok" } | { status: "failed"; reason: "not-granted" }>;
  loadPublicProfile(normalizedName: string): Promise<PublicProfileRecord | null>;
  createBugReport(input: {
    characterId: string;
    category: string;
    message: string;
    position: { x: number; y: number; z: number };
    maxPerDay: number;
  }): Promise<{ status: "created" } | { status: "failed"; reason: "rate-limited" }>;
}
