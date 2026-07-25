import { PROFILE_LIMITS, type CharacterVocation } from "@tibia/protocol";
import type { Pool, PoolClient } from "pg";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import type {
  ProfileSnapshot,
  ProfileStore,
  PublicProfileRecord,
} from "./ProfileStore";
import {
  achievementRowsQuery,
  badgeRowsQuery,
  countRecentBugReportsQuery,
  insertAchievementQuery,
  insertBadgeQuery,
  insertBugReportQuery,
  insertTitleQuery,
  publicProfileQuery,
  selectTitleUpdate,
  selectedTitleQuery,
  titleRowsQuery,
} from "./sql/profileQueries";

/**
 * Postgres profile store. Grants are `ON CONFLICT DO NOTHING` inserts keyed on
 * (character, thing), so concurrent or replayed grants converge on one row and
 * the reported `granted` flag is true for exactly one of them. Title selection
 * validates against the granted rows inside the same statement, so a forged
 * title id updates nothing.
 */
export class PgProfileStore implements ProfileStore {
  constructor(private readonly pool: Pool) {}

  async loadSnapshot(characterId: string): Promise<ProfileSnapshot> {
    const achievements = await this.pool.query<{ achievement_id: string }>(
      achievementRowsQuery,
      [characterId, PROFILE_LIMITS.maxAchievements],
    );
    const titles = await this.pool.query<{ title_id: string }>(titleRowsQuery, [
      characterId,
      PROFILE_LIMITS.maxTitles,
    ]);
    const badges = await this.pool.query<{ badge_id: string }>(badgeRowsQuery, [
      characterId,
      PROFILE_LIMITS.maxBadges,
    ]);
    const selected = await this.pool.query<{ selected_title: string | null }>(
      selectedTitleQuery,
      [characterId],
    );
    return {
      achievements: achievements.rows.map((row) => row.achievement_id),
      titles: titles.rows.map((row) => row.title_id),
      badges: badges.rows.map((row) => row.badge_id),
      selectedTitle: selected.rows[0]?.selected_title ?? null,
    };
  }

  async grantAchievement(input: {
    characterId: string;
    achievementId: string;
    titleId?: string;
  }): Promise<{ granted: boolean }> {
    return runSerializableTransaction(this.pool, async (client) => {
      const inserted = await client.query(insertAchievementQuery, [
        input.characterId,
        input.achievementId,
      ]);
      // The title rides along on the same transaction, so a character can
      // never hold the achievement without the title it unlocks.
      if (input.titleId) {
        await client.query(insertTitleQuery, [
          input.characterId,
          input.titleId,
        ]);
      }
      return { granted: inserted.rowCount === 1 };
    });
  }

  async grantBadge(input: {
    characterId: string;
    badgeId: string;
  }): Promise<{ granted: boolean }> {
    const inserted = await this.pool.query(insertBadgeQuery, [
      input.characterId,
      input.badgeId,
    ]);
    return { granted: inserted.rowCount === 1 };
  }

  async selectTitle(input: {
    characterId: string;
    titleId: string | null;
  }): Promise<{ status: "ok" } | { status: "failed"; reason: "not-granted" }> {
    const updated = await this.pool.query(selectTitleUpdate, [
      input.characterId,
      input.titleId,
    ]);
    if (updated.rowCount !== 1) {
      return { status: "failed", reason: "not-granted" };
    }
    return { status: "ok" };
  }

  async loadPublicProfile(
    normalizedName: string,
  ): Promise<PublicProfileRecord | null> {
    const character = await this.pool.query<{
      id: string;
      display_name: string;
      level: number;
      vocation: CharacterVocation;
      selected_title: string | null;
    }>(publicProfileQuery, [normalizedName]);
    const row = character.rows[0];
    if (!row) return null;
    const achievements = await this.pool.query<{ achievement_id: string }>(
      achievementRowsQuery,
      [row.id, PROFILE_LIMITS.maxAchievements],
    );
    const badges = await this.pool.query<{ badge_id: string }>(badgeRowsQuery, [
      row.id,
      PROFILE_LIMITS.maxBadges,
    ]);
    return {
      characterId: row.id,
      name: row.display_name,
      level: row.level,
      vocation: row.vocation,
      selectedTitle: row.selected_title,
      achievements: achievements.rows.map((entry) => entry.achievement_id),
      badges: badges.rows.map((entry) => entry.badge_id),
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
    return runSerializableTransaction(this.pool, async (client) => {
      // Counted inside the transaction, so reconnecting cannot reset it.
      const count = await this.countToday(client, input.characterId);
      if (count >= input.maxPerDay) {
        return { status: "failed" as const, reason: "rate-limited" as const };
      }
      await client.query(insertBugReportQuery, [
        input.characterId,
        input.category,
        input.message,
        input.position.x,
        input.position.y,
        input.position.z,
      ]);
      return { status: "created" as const };
    });
  }

  private async countToday(
    client: PoolClient,
    characterId: string,
  ): Promise<number> {
    const result = await client.query<{ total: number }>(
      countRecentBugReportsQuery,
      [characterId],
    );
    return result.rows[0]?.total ?? 0;
  }
}
