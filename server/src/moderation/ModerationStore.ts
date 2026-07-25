import type { ReportReason } from "@tibia/protocol";

export interface ActiveMuteRecord {
  readonly mutedUntil: Date;
  readonly reason: string;
}

export interface ModerationOpFailure {
  readonly status: "failed";
  readonly reason:
    | "target-not-found"
    | "not-muted"
    | "not-banned"
    | "rate-limited";
}

export type MuteCharacterResult =
  | {
      readonly status: "muted";
      readonly targetCharacterId: string;
      readonly targetName: string;
      readonly mutedUntil: Date;
    }
  | ModerationOpFailure;

export type UnmuteCharacterResult =
  | {
      readonly status: "unmuted";
      readonly targetCharacterId: string;
      readonly targetName: string;
    }
  | ModerationOpFailure;

export type RecordKickResult =
  | {
      readonly status: "recorded";
      readonly targetCharacterId: string;
      readonly targetName: string;
    }
  | ModerationOpFailure;

export type BanAccountResult =
  | {
      readonly status: "banned";
      readonly accountId: string;
      readonly targetCharacterId: string;
      readonly targetName: string;
      readonly expiresAt: Date;
    }
  | ModerationOpFailure;

export type UnbanAccountResult =
  | {
      readonly status: "unbanned";
      readonly accountId: string;
      readonly targetName: string;
    }
  | ModerationOpFailure;

export type RecordNoteResult =
  | { readonly status: "recorded"; readonly targetName: string }
  | ModerationOpFailure;

/** Admin actions beyond moderation that still owe the audit trail a row. */
export type AdminActionKind = "teleport" | "inspect";

export type CreateReportResult =
  | { readonly status: "created" }
  | ModerationOpFailure;

/** Rows dropped by one retention pass, per table. */
export interface ModerationPruneResult {
  readonly mutes: number;
  readonly bans: number;
  readonly reports: number;
  readonly actions: number;
}

/**
 * Durable moderation storage. Every applied action resolves its target
 * by name and writes its moderation_actions audit row in the same
 * transaction that changes the enforced state (mute row, account ban),
 * so the trail cannot drift from enforcement. Reports are write-only:
 * no method exposes stored reports to gameplay code.
 */
export interface ModerationStore {
  loadMute(characterId: string): Promise<ActiveMuteRecord | null>;
  muteCharacter(input: {
    actorCharacterId: string;
    targetName: string;
    durationMs: number;
    reason: string;
  }): Promise<MuteCharacterResult>;
  unmuteCharacter(input: {
    actorCharacterId: string;
    targetName: string;
  }): Promise<UnmuteCharacterResult>;
  recordKick(input: {
    actorCharacterId: string;
    targetName: string;
    reason: string;
  }): Promise<RecordKickResult>;
  banAccount(input: {
    actorCharacterId: string;
    targetName: string;
    durationMs: number;
    reason: string;
  }): Promise<BanAccountResult>;
  unbanAccount(input: {
    actorCharacterId: string;
    targetName: string;
  }): Promise<UnbanAccountResult>;
  recordNote(input: {
    actorCharacterId: string;
    targetName: string;
    text: string;
  }): Promise<RecordNoteResult>;
  /**
   * Namelocks a character: they cannot enter the world until renamed. The
   * flag and the audit row are written in one transaction, so the trail
   * cannot drift from what is actually enforced.
   */
  namelockCharacter(input: {
    actorCharacterId: string;
    targetName: string;
    reason: string;
  }): Promise<RecordNoteResult>;
  /**
   * Records an admin action against a named target. The target is resolved by
   * name inside the transaction, so a row is only written for a character that
   * actually exists — the same rule the moderation actions follow.
   */
  recordAdminAction(input: {
    actorCharacterId: string;
    action: AdminActionKind;
    targetName: string;
    reason: string;
    detail: Readonly<Record<string, unknown>>;
  }): Promise<RecordNoteResult>;
  createReport(input: {
    reporterCharacterId: string;
    targetName: string;
    reason: ReportReason;
    comment: string;
    maxPerDay: number;
  }): Promise<CreateReportResult>;
  /**
   * Drops moderation metadata older than `before` that is no longer
   * enforcing anything, up to `limit` rows per table
   * (docs/moderation-retention.md).
   */
  pruneRetention(before: Date, limit: number): Promise<ModerationPruneResult>;
}
