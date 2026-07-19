import type { ReportReason } from "@tibia/protocol";
import type {
  ActiveMuteRecord,
  BanAccountResult,
  CreateReportResult,
  ModerationStore,
  MuteCharacterResult,
  RecordKickResult,
  RecordNoteResult,
  UnbanAccountResult,
  UnmuteCharacterResult,
} from "./ModerationStore";

export interface MemoryModerationAction {
  readonly action: string;
  readonly targetCharacterId: string;
  readonly issuedByCharacterId: string;
  readonly reason: string;
}

interface MemoryReport {
  readonly reporterCharacterId: string;
  readonly targetCharacterId: string;
  readonly targetName: string;
  readonly reason: ReportReason;
  readonly comment: string;
  readonly createdAt: number;
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * In-memory ModerationStore mirroring the Pg store's execution-time
 * checks (name resolution, not-muted/not-banned, daily report cap) and
 * recording every applied action so tests can assert the audit trail.
 */
export class MemoryModerationStore implements ModerationStore {
  readonly actions: MemoryModerationAction[] = [];
  readonly reports: MemoryReport[] = [];
  private readonly characters = new Map<
    string,
    { name: string; accountId: string }
  >();
  private readonly mutes = new Map<string, ActiveMuteRecord>();
  private readonly bans = new Map<string, { expiresAt: Date }>();

  /**
   * Mirrors the Pg store's same-transaction update of
   * accounts.banned_until: tests wire this to their account store so the
   * login path observes the ban.
   */
  constructor(
    private readonly onBanChanged?: (
      accountId: string,
      expiresAt: Date | null,
    ) => void,
  ) {}

  registerCharacter(
    characterId: string,
    name: string,
    accountId: string,
  ): void {
    this.characters.set(characterId, { name, accountId });
  }

  async loadMute(characterId: string): Promise<ActiveMuteRecord | null> {
    return this.mutes.get(characterId) ?? null;
  }

  async muteCharacter(input: {
    actorCharacterId: string;
    targetName: string;
    durationMs: number;
    reason: string;
  }): Promise<MuteCharacterResult> {
    const target = this.resolve(input.targetName);
    if (!target) return { status: "failed", reason: "target-not-found" };
    const mutedUntil = new Date(Date.now() + input.durationMs);
    this.mutes.set(target.id, { mutedUntil, reason: input.reason });
    this.record("mute", target.id, input.actorCharacterId, input.reason);
    return {
      status: "muted",
      targetCharacterId: target.id,
      targetName: target.name,
      mutedUntil,
    };
  }

  async unmuteCharacter(input: {
    actorCharacterId: string;
    targetName: string;
  }): Promise<UnmuteCharacterResult> {
    const target = this.resolve(input.targetName);
    if (!target) return { status: "failed", reason: "target-not-found" };
    if (!this.mutes.delete(target.id)) {
      return { status: "failed", reason: "not-muted" };
    }
    this.record("unmute", target.id, input.actorCharacterId, "");
    return {
      status: "unmuted",
      targetCharacterId: target.id,
      targetName: target.name,
    };
  }

  async recordKick(input: {
    actorCharacterId: string;
    targetName: string;
    reason: string;
  }): Promise<RecordKickResult> {
    const target = this.resolve(input.targetName);
    if (!target) return { status: "failed", reason: "target-not-found" };
    this.record("kick", target.id, input.actorCharacterId, input.reason);
    return {
      status: "recorded",
      targetCharacterId: target.id,
      targetName: target.name,
    };
  }

  async banAccount(input: {
    actorCharacterId: string;
    targetName: string;
    durationMs: number;
    reason: string;
  }): Promise<BanAccountResult> {
    const target = this.resolve(input.targetName);
    if (!target) return { status: "failed", reason: "target-not-found" };
    const expiresAt = new Date(Date.now() + input.durationMs);
    this.bans.set(target.accountId, { expiresAt });
    this.onBanChanged?.(target.accountId, expiresAt);
    this.record("ban", target.id, input.actorCharacterId, input.reason);
    return {
      status: "banned",
      accountId: target.accountId,
      targetCharacterId: target.id,
      targetName: target.name,
      expiresAt,
    };
  }

  async unbanAccount(input: {
    actorCharacterId: string;
    targetName: string;
  }): Promise<UnbanAccountResult> {
    const target = this.resolve(input.targetName);
    if (!target) return { status: "failed", reason: "target-not-found" };
    if (!this.bans.delete(target.accountId)) {
      return { status: "failed", reason: "not-banned" };
    }
    this.onBanChanged?.(target.accountId, null);
    this.record("unban", target.id, input.actorCharacterId, "");
    return {
      status: "unbanned",
      accountId: target.accountId,
      targetName: target.name,
    };
  }

  async recordNote(input: {
    actorCharacterId: string;
    targetName: string;
    text: string;
  }): Promise<RecordNoteResult> {
    const target = this.resolve(input.targetName);
    if (!target) return { status: "failed", reason: "target-not-found" };
    this.record("note", target.id, input.actorCharacterId, input.text);
    return { status: "recorded", targetName: target.name };
  }

  async createReport(input: {
    reporterCharacterId: string;
    targetName: string;
    reason: ReportReason;
    comment: string;
    maxPerDay: number;
  }): Promise<CreateReportResult> {
    const target = this.resolve(input.targetName);
    if (!target) return { status: "failed", reason: "target-not-found" };
    const since = Date.now() - DAY_MS;
    const recent = this.reports.filter(
      (report) =>
        report.reporterCharacterId === input.reporterCharacterId &&
        report.createdAt > since,
    );
    if (recent.length >= input.maxPerDay) {
      return { status: "failed", reason: "rate-limited" };
    }
    this.reports.push({
      reporterCharacterId: input.reporterCharacterId,
      targetCharacterId: target.id,
      targetName: target.name,
      reason: input.reason,
      comment: input.comment,
      createdAt: Date.now(),
    });
    return { status: "created" };
  }

  private resolve(
    targetName: string,
  ): { id: string; name: string; accountId: string } | null {
    const wanted = targetName.trim().toLowerCase();
    for (const [id, character] of this.characters) {
      if (character.name.toLowerCase() === wanted) {
        return { id, name: character.name, accountId: character.accountId };
      }
    }
    return null;
  }

  private record(
    action: string,
    targetCharacterId: string,
    issuedByCharacterId: string,
    reason: string,
  ): void {
    this.actions.push({ action, targetCharacterId, issuedByCharacterId, reason });
  }
}
