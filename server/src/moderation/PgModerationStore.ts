import type { Pool, PoolClient } from "pg";
import type { ReportReason } from "@tibia/protocol";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import { isSerializationFailure } from "../guild/isSerializationFailure";
import { characterMuteQuery } from "./sql/characterMuteQuery";
import { countRecentReportsQuery } from "./sql/countRecentReportsQuery";
import { deleteAccountBanQuery } from "./sql/deleteAccountBanQuery";
import { deleteCharacterMuteQuery } from "./sql/deleteCharacterMuteQuery";
import { insertModerationActionQuery } from "./sql/insertModerationActionQuery";
import { insertPlayerReportQuery } from "./sql/insertPlayerReportQuery";
import { moderationCharacterByNameQuery } from "./sql/moderationCharacterByNameQuery";
import { updateAccountBannedUntilQuery } from "./sql/updateAccountBannedUntilQuery";
import { upsertAccountBanQuery } from "./sql/upsertAccountBanQuery";
import { upsertCharacterMuteQuery } from "./sql/upsertCharacterMuteQuery";
import type {
  ActiveMuteRecord,
  BanAccountResult,
  CreateReportResult,
  ModerationOpFailure,
  ModerationStore,
  MuteCharacterResult,
  RecordKickResult,
  RecordNoteResult,
  UnbanAccountResult,
  UnmuteCharacterResult,
} from "./ModerationStore";

interface TargetRow {
  id: string;
  display_name: string;
  account_id: string;
}

/**
 * Postgres ModerationStore. Each action is one SERIALIZABLE transaction
 * that resolves the target from database truth at execution time and
 * writes the state change and its moderation_actions audit row
 * atomically — an applied action without a trail row cannot exist.
 */
export class PgModerationStore implements ModerationStore {
  constructor(private readonly pool: Pool) {}

  async loadMute(characterId: string): Promise<ActiveMuteRecord | null> {
    const result = await this.pool.query<{
      muted_until: Date;
      reason: string;
    }>(characterMuteQuery, [characterId]);
    const row = result.rows[0];
    if (!row) return null;
    return { mutedUntil: row.muted_until, reason: row.reason };
  }

  async muteCharacter(input: {
    actorCharacterId: string;
    targetName: string;
    durationMs: number;
    reason: string;
  }): Promise<MuteCharacterResult> {
    return this.transact(async (client) => {
      const target = await this.requireTarget(client, input.targetName);
      const mutedUntil = new Date(Date.now() + input.durationMs);
      await client.query(upsertCharacterMuteQuery, [
        target.id,
        mutedUntil.toISOString(),
        input.reason,
      ]);
      await client.query(insertModerationActionQuery, [
        "mute",
        target.id,
        input.actorCharacterId,
        input.reason,
        input.durationMs,
        mutedUntil.toISOString(),
      ]);
      return {
        status: "muted" as const,
        targetCharacterId: target.id,
        targetName: target.display_name,
        mutedUntil,
      };
    });
  }

  async unmuteCharacter(input: {
    actorCharacterId: string;
    targetName: string;
  }): Promise<UnmuteCharacterResult> {
    return this.transact(async (client) => {
      const target = await this.requireTarget(client, input.targetName);
      const removed = await client.query(deleteCharacterMuteQuery, [target.id]);
      if (removed.rowCount !== 1) throw this.rollback("not-muted");
      await client.query(insertModerationActionQuery, [
        "unmute",
        target.id,
        input.actorCharacterId,
        "",
        null,
        null,
      ]);
      return {
        status: "unmuted" as const,
        targetCharacterId: target.id,
        targetName: target.display_name,
      };
    });
  }

  async recordKick(input: {
    actorCharacterId: string;
    targetName: string;
    reason: string;
  }): Promise<RecordKickResult> {
    return this.transact(async (client) => {
      const target = await this.requireTarget(client, input.targetName);
      await client.query(insertModerationActionQuery, [
        "kick",
        target.id,
        input.actorCharacterId,
        input.reason,
        null,
        null,
      ]);
      return {
        status: "recorded" as const,
        targetCharacterId: target.id,
        targetName: target.display_name,
      };
    });
  }

  async banAccount(input: {
    actorCharacterId: string;
    targetName: string;
    durationMs: number;
    reason: string;
  }): Promise<BanAccountResult> {
    return this.transact(async (client) => {
      const target = await this.requireTarget(client, input.targetName);
      const expiresAt = new Date(Date.now() + input.durationMs);
      await client.query(updateAccountBannedUntilQuery, [
        target.account_id,
        expiresAt.toISOString(),
      ]);
      await client.query(upsertAccountBanQuery, [
        target.account_id,
        input.reason,
        expiresAt.toISOString(),
        input.actorCharacterId,
      ]);
      await client.query(insertModerationActionQuery, [
        "ban",
        target.id,
        input.actorCharacterId,
        input.reason,
        input.durationMs,
        expiresAt.toISOString(),
      ]);
      return {
        status: "banned" as const,
        accountId: target.account_id,
        targetCharacterId: target.id,
        targetName: target.display_name,
        expiresAt,
      };
    });
  }

  async unbanAccount(input: {
    actorCharacterId: string;
    targetName: string;
  }): Promise<UnbanAccountResult> {
    return this.transact(async (client) => {
      const target = await this.requireTarget(client, input.targetName);
      const removed = await client.query(deleteAccountBanQuery, [
        target.account_id,
      ]);
      if (removed.rowCount !== 1) throw this.rollback("not-banned");
      await client.query(updateAccountBannedUntilQuery, [
        target.account_id,
        null,
      ]);
      await client.query(insertModerationActionQuery, [
        "unban",
        target.id,
        input.actorCharacterId,
        "",
        null,
        null,
      ]);
      return {
        status: "unbanned" as const,
        accountId: target.account_id,
        targetName: target.display_name,
      };
    });
  }

  async recordNote(input: {
    actorCharacterId: string;
    targetName: string;
    text: string;
  }): Promise<RecordNoteResult> {
    return this.transact(async (client) => {
      const target = await this.requireTarget(client, input.targetName);
      await client.query(insertModerationActionQuery, [
        "note",
        target.id,
        input.actorCharacterId,
        input.text,
        null,
        null,
      ]);
      return { status: "recorded" as const, targetName: target.display_name };
    });
  }

  async createReport(input: {
    reporterCharacterId: string;
    targetName: string;
    reason: ReportReason;
    comment: string;
    maxPerDay: number;
  }): Promise<CreateReportResult> {
    return this.transact(async (client) => {
      const target = await this.requireTarget(client, input.targetName);
      // Counted inside the same serializable transaction: racing reports
      // cannot push a reporter past the daily cap.
      const count = await client.query<{ total: number }>(
        countRecentReportsQuery,
        [input.reporterCharacterId],
      );
      if ((count.rows[0]?.total ?? 0) >= input.maxPerDay) {
        throw this.rollback("rate-limited");
      }
      await client.query(insertPlayerReportQuery, [
        input.reporterCharacterId,
        target.id,
        target.display_name,
        input.reason,
        input.comment,
      ]);
      return { status: "created" as const };
    });
  }

  private async requireTarget(
    client: PoolClient,
    targetName: string,
  ): Promise<TargetRow> {
    const result = await client.query<TargetRow>(
      moderationCharacterByNameQuery,
      [targetName],
    );
    const row = result.rows[0];
    if (!row) throw this.rollback("target-not-found");
    return row;
  }

  private async transact<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    let lastCause: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await runSerializableTransaction(this.pool, operation);
      } catch (cause) {
        if (!isSerializationFailure(cause)) throw cause;
        lastCause = cause;
      }
    }
    throw lastCause;
  }

  private rollback(
    reason: ModerationOpFailure["reason"],
  ): TransactionRollback<ModerationOpFailure> {
    return new TransactionRollback<ModerationOpFailure>({
      status: "failed",
      reason,
    });
  }
}
