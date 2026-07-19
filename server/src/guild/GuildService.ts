import {
  GUILD_LIMITS,
  type GuildActionFailedReason,
  type GuildChatMessage,
  type GuildCreateMessage,
  type GuildDeclareWarMessage,
  type GuildDemoteMessage,
  type GuildDisbandMessage,
  type GuildEndWarMessage,
  type GuildEventMessage,
  type GuildInviteMessage,
  type GuildKickMessage,
  type GuildLeaveMessage,
  type GuildOpenMessage,
  type GuildPassLeadershipMessage,
  type GuildPromoteMessage,
  type GuildRespondInviteMessage,
  type GuildRespondWarMessage,
  type GuildRevokeInviteMessage,
  type GuildSetMotdMessage,
  type GuildSetNickMessage,
  type GuildSetRankNameMessage,
} from "@tibia/protocol";
import { ChatRateLimiter } from "../chat/ChatRateLimiter";
import type { ChatModerationHooks } from "../moderation/ChatModerationHooks";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import type { GuildHooks } from "./GuildHooks";
import type { GuildSnapshot, GuildStore } from "./GuildStore";
import { isValidGuildName } from "./isValidGuildName";
import { projectGuildStateFor } from "./projectGuildStateFor";

type GuildIntent =
  | GuildCreateMessage
  | GuildInviteMessage
  | GuildRespondInviteMessage
  | GuildRevokeInviteMessage
  | GuildKickMessage
  | GuildLeaveMessage
  | GuildPromoteMessage
  | GuildDemoteMessage
  | GuildPassLeadershipMessage
  | GuildDisbandMessage
  | GuildSetMotdMessage
  | GuildSetNickMessage
  | GuildSetRankNameMessage
  | GuildOpenMessage
  | GuildChatMessage
  | GuildDeclareWarMessage
  | GuildRespondWarMessage
  | GuildEndWarMessage;

interface CachedMembership {
  readonly guildId: string;
  readonly guildName: string;
  readonly rankLevel: number;
}

const WAR_EXPIRY_CHECK_INTERVAL_MS = 60_000;

/**
 * Server-authoritative guild system on durable storage. Intents are
 * pre-screened against an in-memory cache of online members, but every
 * mutation is re-authorized inside its own database transaction at
 * execution time; results come back through the outcomes queue and are
 * applied inside the tick (charter rules 3–5). Roster and invite data go
 * only to members — and the invite list only to vice+ (charter rule 6);
 * the world sees nothing beyond the public guildName/atWar creature flags.
 */
export class GuildService implements GuildHooks {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();
  private readonly chatLimiter = new ChatRateLimiter();
  private readonly membershipByCharacter = new Map<string, CachedMembership>();
  private readonly snapshotByGuild = new Map<string, GuildSnapshot>();
  private readonly onlineByGuild = new Map<string, Set<string>>();
  private readonly activeWarPairs = new Set<string>();
  private readonly opPendingByCharacter = new Set<string>();
  private nextWarExpiryCheckAt = 0;

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly visibility: Visibility,
    private readonly store?: GuildStore,
    private readonly moderation?: ChatModerationHooks,
  ) {}

  applyResolvedOutcomes(now: number): void {
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  detach(session: Session): void {
    this.cooldownBySession.delete(session.id);
  }

  /** Runs inside the tick before the player leaves the world. */
  detachCharacter(characterId: string): void {
    const membership = this.membershipByCharacter.get(characterId);
    this.membershipByCharacter.delete(characterId);
    this.opPendingByCharacter.delete(characterId);
    if (!membership) return;
    const online = this.onlineByGuild.get(membership.guildId);
    online?.delete(characterId);
    if (!online || online.size === 0) {
      this.dropGuildCaches(membership.guildId);
      return;
    }
    // Remaining members see the roster's online flag change.
    this.sendGuildState(membership.guildId);
  }

  /** Loads the character's guild (or invitations) after world entry. */
  attachCharacter(session: Session, characterId: string): void {
    this.sendOwnState(session, characterId);
  }

  /** True when both characters are in the same guild (both online). */
  sameGuild(characterIdA: string, characterIdB: string): boolean {
    const a = this.membershipByCharacter.get(characterIdA);
    const b = this.membershipByCharacter.get(characterIdB);
    return a !== undefined && b !== undefined && a.guildId === b.guildId;
  }

  /** True when the two characters' guilds have a mutual active war. */
  areAtWar(characterIdA: string, characterIdB: string): boolean {
    const a = this.membershipByCharacter.get(characterIdA);
    const b = this.membershipByCharacter.get(characterIdB);
    if (!a || !b || a.guildId === b.guildId) return false;
    return this.activeWarPairs.has(this.pairKey(a.guildId, b.guildId));
  }

  recordWarKill(
    killerCharacterId: string,
    targetCharacterId: string,
    now: number,
  ): void {
    const store = this.store;
    if (!store) return;
    const killer = this.membershipByCharacter.get(killerCharacterId);
    const target = this.membershipByCharacter.get(targetCharacterId);
    if (!killer || !target || killer.guildId === target.guildId) return;
    if (!this.activeWarPairs.has(this.pairKey(killer.guildId, target.guildId))) {
      return;
    }
    const killerGuildId = killer.guildId;
    const targetGuildId = target.guildId;
    this.enqueue(killerCharacterId, async () => {
      // The store locks the war row and re-checks the frag limit in the
      // same transaction, so racing final kills end the war exactly once.
      const result = await store.recordWarKill({
        killerCharacterId,
        targetCharacterId,
        killerGuildId,
        targetGuildId,
      });
      if (result.status === "no-war") return () => {};
      const applyKiller = await this.loadApplyGuild(killerGuildId);
      const applyTarget = await this.loadApplyGuild(targetGuildId);
      return (at: number) => {
        applyKiller(at);
        applyTarget(at);
        if (result.status === "war-ended") {
          const winnerName =
            result.winnerGuildId === killerGuildId
              ? killer.guildName
              : target.guildName;
          const event: GuildEventMessage = {
            type: "guild-event",
            kind: "war-ended",
            detail: winnerName,
          };
          this.sendEventToGuild(killerGuildId, event);
          this.sendEventToGuild(targetGuildId, event);
        }
      };
    });
  }

  handle(session: Session, intent: GuildIntent, now: number): void {
    const characterId = session.playerId;
    const player = characterId ? this.world.getPlayer(characterId) : undefined;
    if (!characterId || !player) {
      session.sendError("join-required");
      return;
    }
    if (!this.store) {
      this.fail(session, "invalid-request");
      return;
    }
    if (intent.type === "guild-chat") {
      this.deliverChat(session, player, intent.text, now);
      return;
    }
    if (intent.type === "guild-open") {
      if (this.opPendingByCharacter.has(characterId)) return;
      this.sendOwnState(session, characterId);
      return;
    }
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt || this.opPendingByCharacter.has(characterId)) {
      this.fail(session, "rate-limited");
      return;
    }
    this.cooldownBySession.set(session.id, now + GUILD_LIMITS.actionCooldownMs);
    switch (intent.type) {
      case "guild-create":
        this.create(session, characterId, intent.name);
        return;
      case "guild-invite":
        this.invite(session, characterId, player.name, intent.targetName);
        return;
      case "guild-respond-invite":
        this.respondInvite(session, characterId, player.name, intent);
        return;
      case "guild-revoke-invite":
        this.revokeInvite(session, characterId, intent.targetCharacterId);
        return;
      case "guild-kick":
        this.kick(session, characterId, intent.targetCharacterId);
        return;
      case "guild-leave":
        this.leave(session, characterId, player.name);
        return;
      case "guild-promote":
        this.changeRank(session, characterId, intent.targetCharacterId, "promoted");
        return;
      case "guild-demote":
        this.changeRank(session, characterId, intent.targetCharacterId, "demoted");
        return;
      case "guild-pass-leadership":
        this.passLeadership(session, characterId, intent.targetCharacterId);
        return;
      case "guild-disband":
        this.disband(session, characterId);
        return;
      case "guild-set-motd":
        this.setMotd(session, characterId, intent.motd);
        return;
      case "guild-set-nick":
        this.setNick(session, characterId, intent);
        return;
      case "guild-set-rank-name":
        this.setRankName(session, characterId, intent);
        return;
      case "guild-declare-war":
        this.declareWar(session, characterId, intent);
        return;
      case "guild-respond-war":
        this.respondWar(session, characterId, intent);
        return;
      case "guild-end-war":
        this.endWar(session, characterId, intent.warId);
        return;
    }
  }

  tick(now: number): void {
    const store = this.store;
    if (!store || now < this.nextWarExpiryCheckAt) return;
    this.nextWarExpiryCheckAt = now + WAR_EXPIRY_CHECK_INTERVAL_MS;
    const cutoff = new Date(now - GUILD_LIMITS.warPendingExpiryMs);
    const operation = store.expirePendingWars(cutoff).then(
      async (expired) => {
        if (expired.length === 0) return;
        const guildIds = new Set(
          expired
            .flatMap((war) => [war.guild1Id, war.guild2Id])
            .filter((guildId) => this.onlineByGuild.has(guildId)),
        );
        const applies = await Promise.all(
          [...guildIds].map((guildId) => this.loadApplyGuild(guildId)),
        );
        this.outcomes.push((at) => {
          for (const apply of applies) apply(at);
          for (const guildId of guildIds) {
            this.sendEventToGuild(guildId, {
              type: "guild-event",
              kind: "war-rejected",
            });
          }
        });
      },
      (cause: unknown) => this.warn("war-expiry", cause),
    );
    this.track(operation);
  }

  private create(session: Session, characterId: string, name: string): void {
    if (!isValidGuildName(name)) {
      this.fail(session, "invalid-name");
      return;
    }
    const store = this.requireStore();
    this.enqueue(characterId, async () => {
      const result = await store.createGuild({
        ownerCharacterId: characterId,
        name,
      });
      if (result.status === "failed") return this.failLater(session, result.reason);
      return this.loadApplyGuild(result.guildId);
    });
  }

  private invite(
    session: Session,
    characterId: string,
    inviterName: string,
    targetName: string,
  ): void {
    const store = this.requireStore();
    this.enqueue(characterId, async () => {
      const result = await store.createInvite({
        actorCharacterId: characterId,
        targetName,
      });
      if (result.status === "failed") return this.failLater(session, result.reason);
      const apply = await this.loadApplyGuild(result.guildId);
      return (at: number) => {
        apply(at);
        const guildName = this.snapshotByGuild.get(result.guildId)?.name;
        const targetSession = this.registry.sessionFor(result.targetCharacterId);
        if (guildName && targetSession?.playerId === result.targetCharacterId) {
          targetSession.send({
            type: "guild-invitation",
            guildId: result.guildId,
            guildName,
            inviterName,
          });
        }
      };
    });
  }

  private respondInvite(
    session: Session,
    characterId: string,
    playerName: string,
    intent: GuildRespondInviteMessage,
  ): void {
    const store = this.requireStore();
    this.enqueue(characterId, async () => {
      const result = await store.respondInvite({
        characterId,
        guildId: intent.guildId,
        accept: intent.accept,
      });
      if (result.status === "failed") return this.failLater(session, result.reason);
      if (result.status === "declined") {
        const invitations = await store.loadInvitationsFor(characterId);
        return () => {
          if (session.playerId !== characterId) return;
          session.send({
            type: "guild-state",
            guild: null,
            invitations: [...invitations],
          });
        };
      }
      const apply = await this.loadApplyGuild(result.guildId);
      return (at: number) => {
        apply(at);
        this.sendEventToGuild(result.guildId, {
          type: "guild-event",
          kind: "member-joined",
          detail: playerName,
        });
      };
    });
  }

  private revokeInvite(
    session: Session,
    characterId: string,
    targetCharacterId: string,
  ): void {
    const store = this.requireStore();
    this.enqueue(characterId, async () => {
      const result = await store.revokeInvite({
        actorCharacterId: characterId,
        targetCharacterId,
      });
      if (result.status === "failed") return this.failLater(session, result.reason);
      const guildId = await store.loadGuildIdFor(characterId);
      const apply = guildId ? await this.loadApplyGuild(guildId) : null;
      const invitations = await store.loadInvitationsFor(targetCharacterId);
      return (at: number) => {
        apply?.(at);
        const targetSession = this.registry.sessionFor(targetCharacterId);
        if (
          targetSession?.playerId === targetCharacterId &&
          !this.membershipByCharacter.has(targetCharacterId)
        ) {
          targetSession.send({
            type: "guild-state",
            guild: null,
            invitations: [...invitations],
          });
        }
      };
    });
  }

  private kick(
    session: Session,
    characterId: string,
    targetCharacterId: string,
  ): void {
    const store = this.requireStore();
    this.enqueue(characterId, async () => {
      const guildId = await store.loadGuildIdFor(characterId);
      const targetName = guildId
        ? ((await store.loadSnapshot(guildId))?.members.find(
            (member) => member.characterId === targetCharacterId,
          )?.name ?? null)
        : null;
      const result = await store.kickMember({
        actorCharacterId: characterId,
        targetCharacterId,
      });
      if (result.status === "failed") return this.failLater(session, result.reason);
      if (!guildId) return () => {};
      const apply = await this.loadApplyGuild(guildId);
      return (at: number) => {
        apply(at);
        this.sendEventToGuild(guildId, {
          type: "guild-event",
          kind: "member-kicked",
          ...(targetName ? { detail: targetName } : {}),
        });
      };
    });
  }

  private leave(session: Session, characterId: string, playerName: string): void {
    const store = this.requireStore();
    this.enqueue(characterId, async () => {
      const guildId = await store.loadGuildIdFor(characterId);
      const result = await store.leaveGuild({ characterId });
      if (result.status === "failed") return this.failLater(session, result.reason);
      if (!guildId) return () => {};
      const apply = await this.loadApplyGuild(guildId);
      return (at: number) => {
        apply(at);
        this.sendEventToGuild(guildId, {
          type: "guild-event",
          kind: "member-left",
          detail: playerName,
        });
      };
    });
  }

  private changeRank(
    session: Session,
    characterId: string,
    targetCharacterId: string,
    kind: "promoted" | "demoted",
  ): void {
    const store = this.requireStore();
    this.enqueue(characterId, async () => {
      const result =
        kind === "promoted"
          ? await store.promoteMember({
              actorCharacterId: characterId,
              targetCharacterId,
            })
          : await store.demoteMember({
              actorCharacterId: characterId,
              targetCharacterId,
            });
      if (result.status === "failed") return this.failLater(session, result.reason);
      return this.applyGuildWithEvent(characterId, kind, targetCharacterId);
    });
  }

  private passLeadership(
    session: Session,
    characterId: string,
    targetCharacterId: string,
  ): void {
    const store = this.requireStore();
    this.enqueue(characterId, async () => {
      const result = await store.passLeadership({
        actorCharacterId: characterId,
        targetCharacterId,
      });
      if (result.status === "failed") return this.failLater(session, result.reason);
      return this.applyGuildWithEvent(
        characterId,
        "leadership-passed",
        targetCharacterId,
      );
    });
  }

  private disband(session: Session, characterId: string): void {
    const store = this.requireStore();
    this.enqueue(characterId, async () => {
      const guildId = await store.loadGuildIdFor(characterId);
      const result = await store.disbandGuild({ actorCharacterId: characterId });
      if (result.status === "failed") return this.failLater(session, result.reason);
      return (at: number) => {
        if (!guildId) return;
        this.sendEventToGuild(guildId, {
          type: "guild-event",
          kind: "disbanded",
        });
        this.applySnapshot(guildId, null, at);
      };
    });
  }

  private setMotd(session: Session, characterId: string, motd: string): void {
    const store = this.requireStore();
    this.enqueue(characterId, async () => {
      const result = await store.setMotd({
        actorCharacterId: characterId,
        motd,
      });
      if (result.status === "failed") return this.failLater(session, result.reason);
      return this.applyGuildWithEvent(characterId, "motd-changed");
    });
  }

  private setNick(
    session: Session,
    characterId: string,
    intent: GuildSetNickMessage,
  ): void {
    const store = this.requireStore();
    this.enqueue(characterId, async () => {
      const result = await store.setNick({
        actorCharacterId: characterId,
        targetCharacterId: intent.targetCharacterId,
        nick: intent.nick,
      });
      if (result.status === "failed") return this.failLater(session, result.reason);
      const guildId = await store.loadGuildIdFor(characterId);
      return guildId ? this.loadApplyGuild(guildId) : () => {};
    });
  }

  private setRankName(
    session: Session,
    characterId: string,
    intent: GuildSetRankNameMessage,
  ): void {
    const store = this.requireStore();
    this.enqueue(characterId, async () => {
      const result = await store.setRankName({
        actorCharacterId: characterId,
        level: intent.level,
        name: intent.name,
      });
      if (result.status === "failed") return this.failLater(session, result.reason);
      const guildId = await store.loadGuildIdFor(characterId);
      return guildId ? this.loadApplyGuild(guildId) : () => {};
    });
  }

  private declareWar(
    session: Session,
    characterId: string,
    intent: GuildDeclareWarMessage,
  ): void {
    const store = this.requireStore();
    this.enqueue(characterId, async () => {
      const guildId = await store.loadGuildIdFor(characterId);
      const result = await store.declareWar({
        actorCharacterId: characterId,
        targetGuildName: intent.targetGuildName,
        fragLimit: intent.fragLimit,
      });
      if (result.status === "failed") return this.failLater(session, result.reason);
      const applyOwn = guildId ? await this.loadApplyGuild(guildId) : null;
      const applyTarget = await this.loadApplyGuild(result.targetGuildId);
      return (at: number) => {
        applyOwn?.(at);
        applyTarget(at);
        const ownName = guildId ? this.snapshotByGuild.get(guildId)?.name : undefined;
        if (guildId) {
          this.sendEventToGuild(guildId, {
            type: "guild-event",
            kind: "war-declared",
            detail: result.targetGuildName,
          });
        }
        this.sendEventToGuild(result.targetGuildId, {
          type: "guild-event",
          kind: "war-declared",
          ...(ownName ? { detail: ownName } : {}),
        });
      };
    });
  }

  private respondWar(
    session: Session,
    characterId: string,
    intent: GuildRespondWarMessage,
  ): void {
    const store = this.requireStore();
    this.enqueue(characterId, async () => {
      const guildId = await store.loadGuildIdFor(characterId);
      const result = await store.respondWar({
        actorCharacterId: characterId,
        warId: intent.warId,
        accept: intent.accept,
      });
      if (result.status === "failed") return this.failLater(session, result.reason);
      const applyOwn = guildId ? await this.loadApplyGuild(guildId) : null;
      const applyOther = await this.loadApplyGuild(result.otherGuildId);
      const kind = result.status === "war-active" ? "war-accepted" : "war-rejected";
      return (at: number) => {
        applyOwn?.(at);
        applyOther(at);
        if (guildId) {
          this.sendEventToGuild(guildId, { type: "guild-event", kind });
        }
        this.sendEventToGuild(result.otherGuildId, {
          type: "guild-event",
          kind,
        });
      };
    });
  }

  private endWar(session: Session, characterId: string, warId: string): void {
    const store = this.requireStore();
    this.enqueue(characterId, async () => {
      const guildId = await store.loadGuildIdFor(characterId);
      const result = await store.endWar({
        actorCharacterId: characterId,
        warId,
      });
      if (result.status === "failed") return this.failLater(session, result.reason);
      const applyOwn = guildId ? await this.loadApplyGuild(guildId) : null;
      const applyOther = await this.loadApplyGuild(result.otherGuildId);
      return (at: number) => {
        applyOwn?.(at);
        applyOther(at);
        if (guildId) {
          this.sendEventToGuild(guildId, {
            type: "guild-event",
            kind: "war-ended",
          });
        }
        this.sendEventToGuild(result.otherGuildId, {
          type: "guild-event",
          kind: "war-ended",
        });
      };
    });
  }

  private deliverChat(
    session: Session,
    player: Player,
    text: string,
    now: number,
  ): void {
    // Membership is checked at execution time against the cache the guild
    // outcomes keep current: kicked or departed members fail immediately.
    const membership = this.membershipByCharacter.get(player.id);
    if (!membership) {
      this.fail(session, "not-in-guild");
      return;
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    // Moderation mutes gate every chat kind at execution time.
    const moderationMuteMs =
      this.moderation?.muteRemainingMs(player.id, now) ?? 0;
    if (moderationMuteMs > 0) {
      session.send({
        type: "chat-rejected",
        reason: "muted",
        retryAfterMs: moderationMuteMs,
      });
      return;
    }
    const mutedForMs = this.chatLimiter.consume(player.id, now);
    if (mutedForMs > 0) {
      this.moderation?.noteAutoMute(player.id, now + mutedForMs);
      session.send({
        type: "chat-rejected",
        reason: "muted",
        retryAfterMs: mutedForMs,
      });
      return;
    }
    const message = {
      type: "guild-chat-delivered" as const,
      speakerId: player.id,
      speakerName: player.name,
      rankLevel: membership.rankLevel,
      text: trimmed,
    };
    for (const memberId of this.onlineByGuild.get(membership.guildId) ?? []) {
      this.registry.sessionFor(memberId)?.send(message);
    }
  }

  private sendOwnState(session: Session, characterId: string): void {
    const store = this.store;
    if (!store) return;
    this.enqueue(characterId, async () => {
      const guildId = await store.loadGuildIdFor(characterId);
      if (guildId) return this.loadApplyGuild(guildId);
      const invitations = await store.loadInvitationsFor(characterId);
      return () => {
        if (session.playerId !== characterId) return;
        session.send({
          type: "guild-state",
          guild: null,
          invitations: [...invitations],
        });
      };
    });
  }

  /** After a rank/leadership change: refresh the guild and broadcast one event. */
  private async applyGuildWithEvent(
    actorCharacterId: string,
    kind: GuildEventMessage["kind"],
    detailCharacterId?: string,
  ): Promise<(now: number) => void> {
    const store = this.requireStore();
    const guildId = await store.loadGuildIdFor(actorCharacterId);
    if (!guildId) return () => {};
    const apply = await this.loadApplyGuild(guildId);
    return (at: number) => {
      apply(at);
      const detail = detailCharacterId
        ? this.snapshotByGuild
            .get(guildId)
            ?.members.find((member) => member.characterId === detailCharacterId)
            ?.name
        : undefined;
      this.sendEventToGuild(guildId, {
        type: "guild-event",
        kind,
        ...(detail ? { detail } : {}),
      });
    };
  }

  private async loadApplyGuild(
    guildId: string,
  ): Promise<(now: number) => void> {
    const store = this.requireStore();
    const snapshot = await store.loadSnapshot(guildId);
    return (at: number) => this.applySnapshot(guildId, snapshot, at);
  }

  /**
   * Applies one freshly loaded snapshot to the in-memory caches inside the
   * tick: updates memberships and public creature flags, rebuilds the
   * active-war pairs, notifies removed members, and re-sends each online
   * member its rank-filtered projection.
   */
  private applySnapshot(
    guildId: string,
    snapshot: GuildSnapshot | null,
    _now: number,
  ): void {
    const previouslyOnline = this.onlineByGuild.get(guildId) ?? new Set<string>();
    if (!snapshot) {
      for (const characterId of [...previouslyOnline]) {
        this.clearMembership(characterId, guildId);
      }
      this.dropGuildCaches(guildId);
      return;
    }
    const memberIds = new Set(
      snapshot.members.map((member) => member.characterId),
    );
    for (const characterId of [...previouslyOnline]) {
      if (!memberIds.has(characterId)) {
        this.clearMembership(characterId, guildId);
      }
    }
    const online = new Set<string>();
    for (const member of snapshot.members) {
      const session = this.registry.sessionFor(member.characterId);
      if (session?.playerId !== member.characterId) continue;
      online.add(member.characterId);
      this.membershipByCharacter.set(member.characterId, {
        guildId,
        guildName: snapshot.name,
        rankLevel: member.rankLevel,
      });
    }
    if (online.size === 0) {
      this.dropGuildCaches(guildId);
      return;
    }
    this.snapshotByGuild.set(guildId, snapshot);
    this.onlineByGuild.set(guildId, online);
    this.removeWarPairsFor(guildId);
    const atWar = snapshot.wars.some((war) => war.status === 1);
    for (const war of snapshot.wars) {
      if (war.status === 1) {
        this.activeWarPairs.add(this.pairKey(war.guild1Id, war.guild2Id));
      }
    }
    for (const characterId of online) {
      this.updatePublicFlags(characterId, snapshot.name, atWar);
    }
    this.sendGuildState(guildId);
  }

  private clearMembership(characterId: string, guildId: string): void {
    this.membershipByCharacter.delete(characterId);
    this.onlineByGuild.get(guildId)?.delete(characterId);
    this.updatePublicFlags(characterId, null, false);
    const session = this.registry.sessionFor(characterId);
    if (session?.playerId === characterId) {
      // Freshly guildless characters have no pending invitations to show:
      // accepting deleted them all and members cannot be invited.
      session.send({ type: "guild-state", guild: null, invitations: [] });
    }
  }

  private dropGuildCaches(guildId: string): void {
    this.snapshotByGuild.delete(guildId);
    this.onlineByGuild.delete(guildId);
    this.removeWarPairsFor(guildId);
  }

  private updatePublicFlags(
    characterId: string,
    guildName: string | null,
    atWar: boolean,
  ): void {
    const player = this.world.getPlayer(characterId);
    if (!player) return;
    if (player.guildName === guildName && player.guildAtWar === atWar) return;
    player.guildName = guildName;
    player.guildAtWar = atWar;
    this.visibility.onCreatureStateChanged(player);
  }

  private sendGuildState(guildId: string): void {
    const snapshot = this.snapshotByGuild.get(guildId);
    if (!snapshot) return;
    const isOnline = (characterId: string) =>
      this.registry.sessionFor(characterId)?.playerId === characterId;
    for (const memberId of this.onlineByGuild.get(guildId) ?? []) {
      const session = this.registry.sessionFor(memberId);
      if (session?.playerId !== memberId) continue;
      const guild = projectGuildStateFor({
        snapshot,
        characterId: memberId,
        isOnline,
      });
      if (!guild) continue;
      session.send({ type: "guild-state", guild, invitations: [] });
    }
  }

  private sendEventToGuild(guildId: string, event: GuildEventMessage): void {
    for (const memberId of this.onlineByGuild.get(guildId) ?? []) {
      this.registry.sessionFor(memberId)?.send(event);
    }
  }

  private removeWarPairsFor(guildId: string): void {
    for (const key of [...this.activeWarPairs]) {
      const [a, b] = key.split("|");
      if (a === guildId || b === guildId) this.activeWarPairs.delete(key);
    }
  }

  private pairKey(guildIdA: string, guildIdB: string): string {
    return guildIdA < guildIdB
      ? `${guildIdA}|${guildIdB}`
      : `${guildIdB}|${guildIdA}`;
  }

  /**
   * Runs one store operation off-tick and applies its result through the
   * outcomes queue next tick; at most one in flight per character.
   */
  private enqueue(
    characterId: string,
    work: () => Promise<(now: number) => void>,
  ): void {
    this.opPendingByCharacter.add(characterId);
    const operation = work().then(
      (apply) => {
        this.outcomes.push((now) => {
          this.opPendingByCharacter.delete(characterId);
          apply(now);
        });
      },
      (cause: unknown) => {
        this.warn(characterId, cause);
        this.outcomes.push(() => {
          this.opPendingByCharacter.delete(characterId);
        });
      },
    );
    this.track(operation);
  }

  private failLater(
    session: Session,
    reason: GuildActionFailedReason,
  ): (now: number) => void {
    return () => this.fail(session, reason);
  }

  private fail(session: Session, reason: GuildActionFailedReason): void {
    session.send({ type: "guild-action-failed", reason });
  }

  private requireStore(): GuildStore {
    const store = this.store;
    if (!store) throw new Error("guild store is not configured");
    return store;
  }

  private track(operation: Promise<void>): void {
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }

  private warn(context: string, cause: unknown): void {
    const reason = cause instanceof Error ? cause.message : "unknown";
    console.warn(`guild operation failed (${context}): ${reason}`);
  }
}
