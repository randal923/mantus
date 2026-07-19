import {
  REPORT_LIMITS,
  type GmResponseMessage,
  type ReportActionFailedReason,
  type ReportPlayerMessage,
} from "@tibia/protocol";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { ChatModerationHooks } from "./ChatModerationHooks";
import type { ModerationStore } from "./ModerationStore";

interface CachedMute {
  readonly mutedUntil: number;
  readonly reason: string;
}

/**
 * Server-authoritative moderation runtime. Durable GM mutes are cached
 * in memory per online character (loaded at login, updated in the same
 * tick a GM action's transaction resolves) and consulted by every chat
 * path at execution time; spam auto-mutes reported by the flood control
 * live only in memory but apply across all chat kinds. Bans flip
 * accounts.banned_until (checked at login) and immediately kick every
 * online session of the account. Player reports are write-only and rate
 * limited server-side (1/min per session in memory, 20/day per
 * character inside the store transaction).
 */
export class ModerationService implements ChatModerationHooks {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly muteByCharacter = new Map<string, CachedMute>();
  private readonly autoMuteUntilByCharacter = new Map<string, number>();
  private readonly nextReportAtBySession = new Map<string, number>();
  private readonly reportPendingBySession = new Set<string>();

  constructor(
    private readonly registry: SessionRegistry,
    private readonly store?: ModerationStore,
  ) {}

  applyResolvedOutcomes(now: number): void {
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  detach(session: Session): void {
    this.nextReportAtBySession.delete(session.id);
    this.reportPendingBySession.delete(session.id);
  }

  /** Loads the character's durable mute (if any) after world entry. */
  attachCharacter(characterId: string): void {
    const store = this.store;
    if (!store) return;
    this.enqueue(`load-mute:${characterId}`, async () => {
      const mute = await store.loadMute(characterId);
      return () => {
        if (!mute) return;
        const mutedUntil = mute.mutedUntil.getTime();
        if (mutedUntil <= Date.now()) return;
        this.muteByCharacter.set(characterId, {
          mutedUntil,
          reason: mute.reason,
        });
      };
    });
  }

  /** Drops the durable-mute cache row; auto-mutes survive relogging. */
  detachCharacter(characterId: string): void {
    this.muteByCharacter.delete(characterId);
  }

  muteRemainingMs(characterId: string, now: number): number {
    let remaining = 0;
    const mute = this.muteByCharacter.get(characterId);
    if (mute) {
      if (mute.mutedUntil <= now) this.muteByCharacter.delete(characterId);
      else remaining = mute.mutedUntil - now;
    }
    const autoMutedUntil = this.autoMuteUntilByCharacter.get(characterId) ?? 0;
    if (autoMutedUntil <= now) {
      this.autoMuteUntilByCharacter.delete(characterId);
    } else {
      remaining = Math.max(remaining, autoMutedUntil - now);
    }
    return remaining;
  }

  noteAutoMute(characterId: string, mutedUntil: number): void {
    const current = this.autoMuteUntilByCharacter.get(characterId) ?? 0;
    if (mutedUntil > current) {
      this.autoMuteUntilByCharacter.set(characterId, mutedUntil);
    }
  }

  handleReport(
    session: Session,
    intent: ReportPlayerMessage,
    now: number,
  ): void {
    const characterId = session.playerId;
    if (!characterId) {
      session.sendError("join-required");
      return;
    }
    const store = this.store;
    if (!store) {
      this.failReport(session, "invalid-request");
      return;
    }
    const readyAt = this.nextReportAtBySession.get(session.id) ?? 0;
    if (now < readyAt || this.reportPendingBySession.has(session.id)) {
      this.failReport(session, "rate-limited");
      return;
    }
    this.nextReportAtBySession.set(
      session.id,
      now + REPORT_LIMITS.minIntervalMs,
    );
    this.reportPendingBySession.add(session.id);
    this.enqueue(`report:${characterId}`, async () => {
      let result: Awaited<ReturnType<ModerationStore["createReport"]>>;
      try {
        result = await store.createReport({
          reporterCharacterId: characterId,
          targetName: intent.targetName,
          reason: intent.reason,
          comment: intent.comment,
          maxPerDay: REPORT_LIMITS.maxPerDay,
        });
      } catch (cause) {
        return () => {
          this.reportPendingBySession.delete(session.id);
          const reason = cause instanceof Error ? cause.message : "unknown";
          console.warn(`player report failed: ${reason}`);
          if (session.playerId === characterId) {
            this.failReport(session, "invalid-request");
          }
        };
      }
      return () => {
        this.reportPendingBySession.delete(session.id);
        if (session.playerId !== characterId) return;
        if (result.status === "created") {
          session.send({ type: "report-received" });
          return;
        }
        this.failReport(
          session,
          result.reason === "rate-limited" ? "rate-limited" : "target-not-found",
        );
      };
    });
  }

  gmMute(
    session: Session,
    actorCharacterId: string,
    targetName: string,
    minutes: number,
    reason: string,
  ): void {
    const store = this.store;
    if (!store) {
      this.reply(session, false, "Moderation storage is not configured.");
      return;
    }
    this.enqueue(`mute:${actorCharacterId}`, async () => {
      const result = await store.muteCharacter({
        actorCharacterId,
        targetName,
        durationMs: minutes * 60_000,
        reason,
      });
      return () => {
        if (result.status === "failed") {
          this.reply(session, false, this.failureText(result.reason));
          return;
        }
        this.muteByCharacter.set(result.targetCharacterId, {
          mutedUntil: result.mutedUntil.getTime(),
          reason,
        });
        this.reply(
          session,
          true,
          `Muted ${result.targetName} for ${minutes} minute(s).`,
        );
      };
    });
  }

  gmUnmute(
    session: Session,
    actorCharacterId: string,
    targetName: string,
  ): void {
    const store = this.store;
    if (!store) {
      this.reply(session, false, "Moderation storage is not configured.");
      return;
    }
    this.enqueue(`unmute:${actorCharacterId}`, async () => {
      const result = await store.unmuteCharacter({
        actorCharacterId,
        targetName,
      });
      return () => {
        if (result.status === "failed") {
          this.reply(session, false, this.failureText(result.reason));
          return;
        }
        this.muteByCharacter.delete(result.targetCharacterId);
        this.autoMuteUntilByCharacter.delete(result.targetCharacterId);
        this.reply(session, true, `Unmuted ${result.targetName}.`);
      };
    });
  }

  gmKick(
    session: Session,
    actorCharacterId: string,
    targetName: string,
  ): void {
    const store = this.store;
    if (!store) {
      this.reply(session, false, "Moderation storage is not configured.");
      return;
    }
    this.enqueue(`kick:${actorCharacterId}`, async () => {
      const result = await store.recordKick({
        actorCharacterId,
        targetName,
        reason: "",
      });
      return () => {
        if (result.status === "failed") {
          this.reply(session, false, this.failureText(result.reason));
          return;
        }
        const target = this.registry.sessionFor(result.targetCharacterId);
        if (target?.playerId === result.targetCharacterId) {
          target.sendError("kicked");
          target.terminate();
          this.reply(session, true, `Kicked ${result.targetName}.`);
          return;
        }
        this.reply(session, true, `${result.targetName} is not online.`);
      };
    });
  }

  gmBan(
    session: Session,
    actorCharacterId: string,
    targetName: string,
    days: number,
    reason: string,
  ): void {
    const store = this.store;
    if (!store) {
      this.reply(session, false, "Moderation storage is not configured.");
      return;
    }
    this.enqueue(`ban:${actorCharacterId}`, async () => {
      const result = await store.banAccount({
        actorCharacterId,
        targetName,
        durationMs: days * 24 * 3600 * 1000,
        reason,
      });
      return () => {
        if (result.status === "failed") {
          this.reply(session, false, this.failureText(result.reason));
          return;
        }
        // Immediate enforcement: every live session of the banned account
        // is disconnected; the login path re-checks banned_until.
        for (const other of this.registry.all()) {
          if (other.account?.id !== result.accountId) continue;
          other.sendError("account-banned");
          other.terminate();
        }
        this.reply(
          session,
          true,
          `Banned ${result.targetName} for ${days} day(s).`,
        );
      };
    });
  }

  gmUnban(
    session: Session,
    actorCharacterId: string,
    targetName: string,
  ): void {
    const store = this.store;
    if (!store) {
      this.reply(session, false, "Moderation storage is not configured.");
      return;
    }
    this.enqueue(`unban:${actorCharacterId}`, async () => {
      const result = await store.unbanAccount({ actorCharacterId, targetName });
      return () => {
        if (result.status === "failed") {
          this.reply(session, false, this.failureText(result.reason));
          return;
        }
        this.reply(session, true, `Unbanned ${result.targetName}.`);
      };
    });
  }

  gmNote(
    session: Session,
    actorCharacterId: string,
    targetName: string,
    text: string,
  ): void {
    const store = this.store;
    if (!store) {
      this.reply(session, false, "Moderation storage is not configured.");
      return;
    }
    this.enqueue(`note:${actorCharacterId}`, async () => {
      const result = await store.recordNote({
        actorCharacterId,
        targetName,
        text,
      });
      return () => {
        if (result.status === "failed") {
          this.reply(session, false, this.failureText(result.reason));
          return;
        }
        this.reply(session, true, `Noted on ${result.targetName}.`);
      };
    });
  }

  private failureText(
    reason: "target-not-found" | "not-muted" | "not-banned" | "rate-limited",
  ): string {
    if (reason === "target-not-found") return "No character by that name.";
    if (reason === "not-muted") return "That character is not muted.";
    if (reason === "not-banned") return "That account is not banned.";
    return "Rate limited.";
  }

  private failReport(session: Session, reason: ReportActionFailedReason): void {
    session.send({ type: "report-action-failed", reason });
  }

  private reply(session: Session, ok: boolean, text: string): void {
    const message: GmResponseMessage = { type: "gm-response", ok, text };
    session.send(message);
  }

  private enqueue(
    context: string,
    work: () => Promise<(now: number) => void>,
  ): void {
    const operation = work().then(
      (apply) => {
        this.outcomes.push(apply);
      },
      (cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`moderation operation failed (${context}): ${reason}`);
      },
    );
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }
}
