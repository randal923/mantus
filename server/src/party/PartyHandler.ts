import { randomUUID } from "node:crypto";
import {
  PARTY_LIMITS,
  type PartyActionFailedReason,
  type PartyChatMessage,
  type PartyInviteMessage,
  type PartyKickMessage,
  type PartyLeaveMessage,
  type PartyMemberEntry,
  type PartyPassLeadershipMessage,
  type PartyRespondInviteMessage,
  type PartyRevokeInviteMessage,
  type PartySetSharedExpMessage,
  type PartyStateMessage,
} from "@tibia/protocol";
import { ChatRateLimiter } from "../chat/ChatRateLimiter";
import type { ChatModerationHooks } from "../moderation/ChatModerationHooks";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { getPartyExperienceShares } from "./getPartyExperienceShares";
import { getPartyMemberProjection } from "./getPartyMemberProjection";
import { getSharedExpStatus } from "./getSharedExpStatus";
import { isWithinPartyStatusRange } from "./isWithinPartyStatusRange";
import { Party } from "./Party";
import type { PartyHooks } from "./PartyHooks";
import { PartyRegistry } from "./PartyRegistry";

type PartyIntent =
  | PartyInviteMessage
  | PartyRespondInviteMessage
  | PartyRevokeInviteMessage
  | PartyLeaveMessage
  | PartyKickMessage
  | PartyPassLeadershipMessage
  | PartySetSharedExpMessage
  | PartyChatMessage;

/** Live hp/mana refresh cadence for members (structural changes flush sooner). */
const STATUS_BROADCAST_INTERVAL_MS = 1_000;

/**
 * Server-authoritative party system (Canary parity, in-memory only). Every
 * intent re-checks membership, leadership, and limits at execution time
 * inside the tick; party status (hp/mana) is projected per recipient and
 * range-gated so no member learns state it could not see (charter rule 6).
 */
export class PartyHandler implements PartyHooks {
  private readonly parties = new PartyRegistry();
  private readonly cooldownBySession = new Map<string, number>();
  private readonly chatLimiter = new ChatRateLimiter();
  private readonly dirtyParties = new Set<Party>();
  private nextStatusBroadcastAt = 0;

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly visibility: Visibility,
    private readonly moderation?: ChatModerationHooks,
  ) {}

  handle(session: Session, intent: PartyIntent, now: number): void {
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    if (!playerId || !player) {
      session.sendError("join-required");
      return;
    }
    if (intent.type === "party-chat") {
      this.deliverChat(session, player, intent.text, now);
      return;
    }
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt) {
      this.fail(session, "rate-limited");
      return;
    }
    this.cooldownBySession.set(session.id, now + PARTY_LIMITS.actionCooldownMs);
    switch (intent.type) {
      case "party-invite":
        this.invite(session, player, intent.targetName, now);
        return;
      case "party-respond-invite":
        this.respondInvite(session, player, intent, now);
        return;
      case "party-revoke-invite":
        this.revokeInvite(session, player, intent.targetPlayerId, now);
        return;
      case "party-leave":
        this.leave(session, player, now);
        return;
      case "party-kick":
        this.kick(session, player, intent.targetPlayerId, now);
        return;
      case "party-pass-leadership":
        this.passLeadership(session, player, intent.targetPlayerId);
        return;
      case "party-set-shared-exp":
        this.setSharedExp(session, player, intent.enabled);
        return;
    }
  }

  tick(now: number): void {
    const broadcastAll = now >= this.nextStatusBroadcastAt;
    if (broadcastAll) {
      this.nextStatusBroadcastAt = now + STATUS_BROADCAST_INTERVAL_MS;
    }
    if (!broadcastAll && this.dirtyParties.size === 0) return;
    for (const party of this.parties.all()) {
      if (!broadcastAll && !this.dirtyParties.has(party)) continue;
      this.sendPartyState(party, now);
    }
    this.dirtyParties.clear();
  }

  detach(session: Session): void {
    this.cooldownBySession.delete(session.id);
  }

  /** Runs inside the tick before the player leaves the world. */
  detachCharacter(playerId: string, now: number): void {
    for (const party of this.parties.partiesInviting(playerId)) {
      party.removeInvite(playerId);
      this.markDirty(party);
      this.disbandIfEmpty(party);
    }
    const party = this.parties.partyOf(playerId);
    if (!party) return;
    this.removeFromParty(party, playerId);
  }

  /** True when both players are members of the same party right now. */
  sameParty(playerIdA: string, playerIdB: string): boolean {
    const party = this.parties.partyOf(playerIdA);
    return party !== undefined && party === this.parties.partyOf(playerIdB);
  }

  recordMonsterDamage(sourceId: string, now: number): void {
    this.parties.partyOf(sourceId)?.recordActivity(sourceId, now);
  }

  recordPartnerHeal(sourceId: string, targetId: string, now: number): void {
    if (sourceId === targetId) return;
    const party = this.parties.partyOf(sourceId);
    if (!party || !party.isMember(targetId)) return;
    party.recordActivity(sourceId, now);
  }

  getExperienceShares(
    killerId: string,
    baseExperience: number,
    now: number,
  ): ReadonlyArray<{ playerId: string; amount: number }> | null {
    const party = this.parties.partyOf(killerId);
    if (!party || !party.sharedExpActive) return null;
    const getPlayer = (playerId: string) => this.world.getPlayer(playerId);
    if (getSharedExpStatus(party, getPlayer, now) !== "ok") return null;
    const members: Array<{ playerId: string; vocation: Player["vocation"] }> =
      [];
    for (const memberId of party.allMemberIds()) {
      const member = this.world.getPlayer(memberId);
      if (!member) return null;
      members.push({ playerId: memberId, vocation: member.vocation });
    }
    return getPartyExperienceShares(members, baseExperience);
  }

  getQuestParticipantIds(playerId: string): ReadonlyArray<string> {
    const party = this.parties.partyOf(playerId);
    if (!party) return this.world.getPlayer(playerId) ? [playerId] : [];
    return party
      .allMemberIds()
      .filter((memberId) => this.world.getPlayer(memberId));
  }

  private invite(
    session: Session,
    player: Player,
    targetName: string,
    now: number,
  ): void {
    const target = this.findOnlinePlayerByName(targetName);
    if (!target) {
      this.fail(session, "target-not-found");
      return;
    }
    if (target.id === player.id) {
      this.fail(session, "invalid-target");
      return;
    }
    if (this.parties.partyOf(target.id)) {
      this.fail(session, "target-already-in-party");
      return;
    }
    let party = this.parties.partyOf(player.id);
    if (party && party.leaderId !== player.id) {
      this.fail(session, "not-leader");
      return;
    }
    if (party?.isInvited(target.id)) {
      this.fail(session, "already-invited");
      return;
    }
    if (party && party.size >= PARTY_LIMITS.maxMembers) {
      this.fail(session, "party-full");
      return;
    }
    if (party && party.inviteeIds.length >= PARTY_LIMITS.maxPendingInvites) {
      this.fail(session, "invite-limit");
      return;
    }
    if (!party) {
      party = new Party(randomUUID(), player.id, now);
      this.parties.add(party);
      this.setPartyFlag(player, true);
    }
    party.invite(target.id);
    this.registry.sessionFor(target.id)?.send({
      type: "party-invitation",
      leaderId: player.id,
      leaderName: player.name,
      partyId: party.id,
    });
    this.markDirty(party);
  }

  private respondInvite(
    session: Session,
    player: Player,
    intent: PartyRespondInviteMessage,
    now: number,
  ): void {
    const party = this.parties.partyOf(intent.leaderId);
    if (
      !party ||
      party.leaderId !== intent.leaderId ||
      !party.isInvited(player.id)
    ) {
      this.fail(session, "not-invited");
      return;
    }
    party.removeInvite(player.id);
    if (!intent.accept) {
      this.markDirty(party);
      this.disbandIfEmpty(party);
      return;
    }
    if (this.parties.partyOf(player.id)) {
      this.fail(session, "target-already-in-party");
      this.markDirty(party);
      return;
    }
    if (party.size >= PARTY_LIMITS.maxMembers) {
      this.fail(session, "party-full");
      this.markDirty(party);
      return;
    }
    party.addMember(player.id, now);
    this.parties.bindMember(player.id, party);
    this.setPartyFlag(player, true);
    this.markDirty(party);
  }

  private revokeInvite(
    session: Session,
    player: Player,
    targetPlayerId: string,
    now: number,
  ): void {
    const party = this.parties.partyOf(player.id);
    if (!party) {
      this.fail(session, "not-in-party");
      return;
    }
    if (party.leaderId !== player.id) {
      this.fail(session, "not-leader");
      return;
    }
    if (!party.removeInvite(targetPlayerId)) {
      this.fail(session, "not-invited");
      return;
    }
    this.registry.sessionFor(targetPlayerId)?.send({
      type: "party-invitation-revoked",
      leaderId: player.id,
    });
    this.markDirty(party);
    this.disbandIfEmpty(party);
  }

  private leave(session: Session, player: Player, now: number): void {
    const party = this.parties.partyOf(player.id);
    if (!party) {
      this.fail(session, "not-in-party");
      return;
    }
    // Canary parity: no leaving mid-fight outside a protection zone.
    if (
      player.conditions.has("combat-lock") &&
      !this.world.isProtectionZone(player.position)
    ) {
      this.fail(session, "in-fight");
      return;
    }
    this.removeFromParty(party, player.id);
  }

  private kick(
    session: Session,
    player: Player,
    targetPlayerId: string,
    now: number,
  ): void {
    const party = this.parties.partyOf(player.id);
    if (!party) {
      this.fail(session, "not-in-party");
      return;
    }
    if (party.leaderId !== player.id) {
      this.fail(session, "not-leader");
      return;
    }
    if (targetPlayerId === player.id) {
      this.fail(session, "invalid-target");
      return;
    }
    if (!party.memberIds.includes(targetPlayerId)) {
      this.fail(session, "target-not-member");
      return;
    }
    this.removeFromParty(party, targetPlayerId);
  }

  private passLeadership(
    session: Session,
    player: Player,
    targetPlayerId: string,
  ): void {
    const party = this.parties.partyOf(player.id);
    if (!party) {
      this.fail(session, "not-in-party");
      return;
    }
    if (party.leaderId !== player.id) {
      this.fail(session, "not-leader");
      return;
    }
    if (!party.passLeadership(targetPlayerId)) {
      this.fail(session, "target-not-member");
      return;
    }
    this.markDirty(party);
  }

  private setSharedExp(
    session: Session,
    player: Player,
    enabled: boolean,
  ): void {
    const party = this.parties.partyOf(player.id);
    if (!party) {
      this.fail(session, "not-in-party");
      return;
    }
    if (party.leaderId !== player.id) {
      this.fail(session, "not-leader");
      return;
    }
    party.sharedExpActive = enabled;
    this.markDirty(party);
  }

  private deliverChat(
    session: Session,
    player: Player,
    text: string,
    now: number,
  ): void {
    const party = this.parties.partyOf(player.id);
    if (!party) {
      this.fail(session, "not-in-party");
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
      type: "party-chat-delivered" as const,
      speakerId: player.id,
      speakerName: player.name,
      text: trimmed,
    };
    for (const memberId of party.allMemberIds()) {
      this.registry.sessionFor(memberId)?.send(message);
    }
  }

  /** Removes one member/leader, promoting or disbanding as Canary does. */
  private removeFromParty(party: Party, playerId: string): void {
    if (party.leaderId === playerId) {
      const heir = party.memberIds[0];
      if (heir) {
        party.passLeadership(heir);
        party.removeMember(playerId);
      } else {
        this.disband(party);
        return;
      }
    } else {
      party.removeMember(playerId);
    }
    this.parties.unbindMember(playerId);
    const removed = this.world.getPlayer(playerId);
    if (removed) this.setPartyFlag(removed, false);
    this.registry.sessionFor(playerId)?.send({
      type: "party-state",
      party: null,
    });
    this.markDirty(party);
    this.disbandIfEmpty(party);
  }

  private disbandIfEmpty(party: Party): void {
    if (party.memberIds.length > 0 || party.inviteeIds.length > 0) return;
    this.disband(party);
  }

  private disband(party: Party): void {
    for (const inviteeId of [...party.inviteeIds]) {
      party.removeInvite(inviteeId);
      this.registry.sessionFor(inviteeId)?.send({
        type: "party-invitation-revoked",
        leaderId: party.leaderId,
      });
    }
    for (const memberId of party.allMemberIds()) {
      const member = this.world.getPlayer(memberId);
      if (member) this.setPartyFlag(member, false);
      this.registry.sessionFor(memberId)?.send({
        type: "party-state",
        party: null,
      });
    }
    this.dirtyParties.delete(party);
    this.parties.remove(party);
  }

  private sendPartyState(party: Party, now: number): void {
    const getPlayer = (playerId: string) => this.world.getPlayer(playerId);
    const status = getSharedExpStatus(party, getPlayer, now);
    const eligible = status === "ok";
    const invited = party.inviteeIds.map((inviteeId) => ({
      id: inviteeId,
      name: this.world.getPlayer(inviteeId)?.name ?? "?",
    }));
    const members = party
      .allMemberIds()
      .map((memberId) => this.world.getPlayer(memberId))
      .filter((member): member is Player => member !== undefined);
    for (const recipient of members) {
      const session = this.registry.sessionFor(recipient.id);
      if (!session || session.playerId !== recipient.id) continue;
      const entries: PartyMemberEntry[] = members.map((member) =>
        getPartyMemberProjection({
          id: member.id,
          name: member.name,
          level: member.level,
          vocation: member.vocation,
          isLeader: member.id === party.leaderId,
          eligibleForSharedExp: eligible,
          withinRecipientRange: isWithinPartyStatusRange(
            recipient.position,
            member.position,
          ),
          healthPercent: member.healthPercent,
          manaPercent:
            member.maxMana > 0
              ? Math.min(
                  100,
                  Math.max(0, Math.round((member.mana / member.maxMana) * 100)),
                )
              : 0,
        }),
      );
      const message: PartyStateMessage = {
        type: "party-state",
        party: {
          partyId: party.id,
          leaderId: party.leaderId,
          sharedExpActive: party.sharedExpActive,
          sharedExpStatus: status,
          members: entries,
          invited,
        },
      };
      session.send(message);
    }
  }

  private markDirty(party: Party): void {
    this.dirtyParties.add(party);
  }

  private setPartyFlag(player: Player, inParty: boolean): void {
    if (player.partyMember === inParty) return;
    player.partyMember = inParty;
    this.visibility.onCreatureStateChanged(player);
  }

  private findOnlinePlayerByName(name: string): Player | undefined {
    const wanted = name.trim().toLowerCase();
    if (wanted.length === 0) return undefined;
    for (const player of this.world.allPlayers()) {
      if (player.name.toLowerCase() === wanted) return player;
    }
    return undefined;
  }

  private fail(session: Session, reason: PartyActionFailedReason): void {
    session.send({ type: "party-action-failed", reason });
  }
}
