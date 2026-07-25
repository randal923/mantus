import type { Pool, PoolClient } from "pg";
import type { ReportReason } from "@tibia/protocol";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import { monotonicNow } from "../monotonicNow";
import { characterMuteQuery } from "./sql/characterMuteQuery";
import { countRecentReportsQuery } from "./sql/countRecentReportsQuery";
import { deleteAccountBanQuery } from "./sql/deleteAccountBanQuery";
import { deleteCharacterMuteQuery } from "./sql/deleteCharacterMuteQuery";
import { setNamelockUpdate } from "../profile/sql/profileQueries";
import { insertAdminActionQuery } from "./sql/insertAdminActionQuery";
import { insertModerationActionQuery } from "./sql/insertModerationActionQuery";
import { insertPlayerReportQuery } from "./sql/insertPlayerReportQuery";
import { moderationCharacterByNameQuery } from "./sql/moderationCharacterByNameQuery";
import { pruneModerationRetentionQuery } from "./sql/pruneModerationRetentionQuery";
import { updateAccountBannedUntilQuery } from "./sql/updateAccountBannedUntilQuery";
import { upsertAccountBanQuery } from "./sql/upsertAccountBanQuery";
import { upsertCharacterMuteQuery } from "./sql/upsertCharacterMuteQuery";
import type {
  ActiveMuteRecord,
  AdminActionKind,
  BanAccountResult,
  CreateReportResult,
  ModerationOpFailure,
  ModerationPruneResult,
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
    return runSerializableTransaction(this.pool, async (client) => {
      const target = await this.requireTarget(client, input.targetName);
      const mutedUntil = new Date(monotonicNow() + input.durationMs);
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
    return runSerializableTransaction(this.pool, async (client) => {
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
    return runSerializableTransaction(this.pool, async (client) => {
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
    return runSerializableTransaction(this.pool, async (client) => {
      const target = await this.requireTarget(client, input.targetName);
      const expiresAt = new Date(monotonicNow() + input.durationMs);
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
    return runSerializableTransaction(this.pool, async (client) => {
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
    return runSerializableTransaction(this.pool, async (client) => {
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

  async namelockCharacter(input: {
    actorCharacterId: string;
    targetName: string;
    reason: string;
  }): Promise<RecordNoteResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const target = await this.requireTarget(client, input.targetName);
      await client.query(setNamelockUpdate, [target.id, true]);
      await client.query(insertModerationActionQuery, [
        "namelock",
        target.id,
        input.actorCharacterId,
        input.reason,
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
    return runSerializableTransaction(this.pool, async (client) => {
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

  async pruneRetention(
    before: Date,
    limit: number,
  ): Promise<ModerationPruneResult> {
    const result = await this.pool.query<{
      mutes: string;
      bans: string;
      reports: string;
      actions: string;
    }>(pruneModerationRetentionQuery, [before.toISOString(), limit]);
    const row = result.rows[0];
    return {
      mutes: Number(row?.mutes ?? 0),
      bans: Number(row?.bans ?? 0),
      reports: Number(row?.reports ?? 0),
      actions: Number(row?.actions ?? 0),
    };
  }

  async recordAdminAction(input: {
    actorCharacterId: string;
    action: AdminActionKind;
    targetName: string;
    reason: string;
    detail: Readonly<Record<string, unknown>>;
  }): Promise<RecordNoteResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const target = await this.requireTarget(client, input.targetName);
      await client.query(insertAdminActionQuery, [
        input.action,
        target.id,
        input.actorCharacterId,
        input.reason,
        JSON.stringify(input.detail),
      ]);
      return { status: "recorded" as const, targetName: target.display_name };
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

  private rollback(
    reason: ModerationOpFailure["reason"],
  ): TransactionRollback<ModerationOpFailure> {
    return new TransactionRollback<ModerationOpFailure>({
      status: "failed",
      reason,
    });
  }
}
