import { randomUUID } from "node:crypto";
import type { GuildInvitationEntry } from "@tibia/protocol";
import { GUILD_LIMITS } from "@tibia/protocol";
import { monotonicNow } from "../monotonicNow";
import type {
  CreateGuildResult,
  DeclareWarResult,
  EndWarResult,
  ExpiredWarRecord,
  GuildInviteResult,
  GuildOpFailure,
  GuildOpResult,
  GuildSnapshot,
  GuildStore,
  RecordWarKillResult,
  RespondInviteResult,
  RespondWarResult,
} from "./GuildStore";
import { normalizeGuildName } from "./normalizeGuildName";

interface MemoryGuild {
  id: string;
  name: string;
  motd: string;
  ownerCharacterId: string;
  rankNames: Map<number, string>;
}

interface MemoryMember {
  guildId: string;
  rankLevel: number;
  nick: string;
}

interface MemoryInvite {
  characterId: string;
  guildId: string;
  invitedByCharacterId: string;
  createdAt: number;
}

interface MemoryWar {
  id: string;
  guild1Id: string;
  guild2Id: string;
  status: number;
  fragLimit: number;
  startedAt: number;
  winnerGuildId: string | null;
}

interface MemoryWarKill {
  warId: string;
  killerGuildId: string;
}

const WAR_PENDING = 0;
const WAR_ACTIVE = 1;
const WAR_REJECTED = 2;
const WAR_CANCELED = 3;
const WAR_ENDED = 4;

/**
 * In-memory GuildStore mirroring the Pg store's execution-time re-checks
 * and its database-uniqueness semantics (normalized guild name, one guild
 * per character, one open war per pair, single frag-limit end transition),
 * so service tests exercise the same failure paths.
 */
export class MemoryGuildStore implements GuildStore {
  private readonly characterNames = new Map<string, string>();
  private readonly guilds = new Map<string, MemoryGuild>();
  private readonly members = new Map<string, MemoryMember>();
  private readonly invites = new Map<string, MemoryInvite>();
  private readonly wars = new Map<string, MemoryWar>();
  private readonly warKills: MemoryWarKill[] = [];
  private clock = 0;

  registerCharacter(characterId: string, name: string): void {
    this.characterNames.set(characterId, name);
  }

  async loadGuildIdFor(characterId: string): Promise<string | null> {
    return this.members.get(characterId)?.guildId ?? null;
  }

  async loadSnapshot(guildId: string): Promise<GuildSnapshot | null> {
    const guild = this.guilds.get(guildId);
    if (!guild) return null;
    const members = [...this.members.entries()]
      .filter(([, member]) => member.guildId === guildId)
      .map(([characterId, member]) => ({
        characterId,
        name: this.characterNames.get(characterId) ?? "?",
        rankLevel: member.rankLevel,
        nick: member.nick,
      }))
      .sort(
        (a, b) => b.rankLevel - a.rankLevel || a.name.localeCompare(b.name),
      );
    const invites = [...this.invites.values()]
      .filter((invite) => invite.guildId === guildId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((invite) => ({
        characterId: invite.characterId,
        name: this.characterNames.get(invite.characterId) ?? "?",
      }));
    const wars = [...this.wars.values()]
      .filter(
        (war) =>
          (war.guild1Id === guildId || war.guild2Id === guildId) &&
          (war.status === WAR_PENDING ||
            war.status === WAR_ACTIVE ||
            war.status === WAR_ENDED),
      )
      .map((war) => ({
        id: war.id,
        guild1Id: war.guild1Id,
        guild2Id: war.guild2Id,
        guild1Name: this.guilds.get(war.guild1Id)?.name ?? "?",
        guild2Name: this.guilds.get(war.guild2Id)?.name ?? "?",
        status: war.status,
        fragLimit: war.fragLimit,
        guild1Kills: this.killCount(war.id, war.guild1Id),
        guild2Kills: this.killCount(war.id, war.guild2Id),
      }));
    return {
      id: guild.id,
      name: guild.name,
      motd: guild.motd,
      ownerCharacterId: guild.ownerCharacterId,
      ranks: [3, 2, 1].map((level) => ({
        id: `${guild.id}:${level}`,
        level,
        name: guild.rankNames.get(level) ?? "?",
      })),
      members,
      invites,
      wars,
    };
  }

  async loadInvitationsFor(
    characterId: string,
  ): Promise<ReadonlyArray<GuildInvitationEntry>> {
    return [...this.invites.values()]
      .filter((invite) => invite.characterId === characterId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((invite) => ({
        guildId: invite.guildId,
        guildName: this.guilds.get(invite.guildId)?.name ?? "?",
        inviterName:
          this.characterNames.get(invite.invitedByCharacterId) ?? "?",
      }));
  }

  async createGuild(input: {
    ownerCharacterId: string;
    name: string;
  }): Promise<CreateGuildResult> {
    if (this.members.has(input.ownerCharacterId)) {
      return this.fail("already-in-guild");
    }
    const normalized = normalizeGuildName(input.name);
    for (const guild of this.guilds.values()) {
      if (normalizeGuildName(guild.name) === normalized) {
        return this.fail("name-taken");
      }
    }
    const guildId = randomUUID();
    this.guilds.set(guildId, {
      id: guildId,
      name: input.name.trim(),
      motd: "",
      ownerCharacterId: input.ownerCharacterId,
      rankNames: new Map([
        [3, "The Leader"],
        [2, "Vice-Leader"],
        [1, "Member"],
      ]),
    });
    this.members.set(input.ownerCharacterId, {
      guildId,
      rankLevel: 3,
      nick: "",
    });
    this.deleteInvitesFor(input.ownerCharacterId);
    return { status: "created", guildId };
  }

  async createInvite(input: {
    actorCharacterId: string;
    targetName: string;
  }): Promise<GuildInviteResult> {
    const actor = this.members.get(input.actorCharacterId);
    if (!actor) return this.fail("not-in-guild");
    if (actor.rankLevel < 2) return this.fail("not-authorized");
    const wanted = input.targetName.trim().toLowerCase();
    const target = [...this.characterNames.entries()].find(
      ([, name]) => name.toLowerCase() === wanted,
    );
    if (!target) return this.fail("target-not-found");
    const [targetCharacterId, targetName] = target;
    if (this.members.has(targetCharacterId)) {
      return this.fail("target-already-in-guild");
    }
    if (this.invites.has(`${targetCharacterId}|${actor.guildId}`)) {
      return this.fail("already-invited");
    }
    const pending = [...this.invites.values()].filter(
      (invite) => invite.guildId === actor.guildId,
    );
    if (pending.length >= GUILD_LIMITS.maxInvitesPerGuild) {
      return this.fail("invite-limit");
    }
    this.invites.set(`${targetCharacterId}|${actor.guildId}`, {
      characterId: targetCharacterId,
      guildId: actor.guildId,
      invitedByCharacterId: input.actorCharacterId,
      createdAt: this.clock++,
    });
    return {
      status: "invited",
      guildId: actor.guildId,
      targetCharacterId,
      targetName,
    };
  }

  async respondInvite(input: {
    characterId: string;
    guildId: string;
    accept: boolean;
  }): Promise<RespondInviteResult> {
    const key = `${input.characterId}|${input.guildId}`;
    if (!this.invites.delete(key)) return this.fail("invite-not-found");
    if (!input.accept) return { status: "declined" };
    // The single-column membership "primary key": one guild per character.
    if (this.members.has(input.characterId)) {
      return this.fail("already-in-guild");
    }
    if (!this.guilds.has(input.guildId)) return this.fail("guild-not-found");
    this.members.set(input.characterId, {
      guildId: input.guildId,
      rankLevel: 1,
      nick: "",
    });
    this.deleteInvitesFor(input.characterId);
    return { status: "joined", guildId: input.guildId };
  }

  async revokeInvite(input: {
    actorCharacterId: string;
    targetCharacterId: string;
  }): Promise<GuildOpResult> {
    const actor = this.members.get(input.actorCharacterId);
    if (!actor) return this.fail("not-in-guild");
    if (actor.rankLevel < 2) return this.fail("not-authorized");
    const removed = this.invites.delete(
      `${input.targetCharacterId}|${actor.guildId}`,
    );
    return removed ? { status: "ok" } : this.fail("invite-not-found");
  }

  async kickMember(input: {
    actorCharacterId: string;
    targetCharacterId: string;
  }): Promise<GuildOpResult> {
    const actor = this.members.get(input.actorCharacterId);
    if (!actor) return this.fail("not-in-guild");
    if (actor.rankLevel < 2) return this.fail("not-authorized");
    const target = this.members.get(input.targetCharacterId);
    if (!target || target.guildId !== actor.guildId) {
      return this.fail("target-not-member");
    }
    if (target.rankLevel >= actor.rankLevel) {
      return this.fail("cannot-kick-higher-rank");
    }
    this.members.delete(input.targetCharacterId);
    return { status: "ok" };
  }

  async leaveGuild(input: { characterId: string }): Promise<GuildOpResult> {
    const member = this.members.get(input.characterId);
    if (!member) return this.fail("not-in-guild");
    const guild = this.guilds.get(member.guildId);
    if (guild?.ownerCharacterId === input.characterId) {
      return this.fail("leader-cannot-leave");
    }
    this.members.delete(input.characterId);
    return { status: "ok" };
  }

  async promoteMember(input: {
    actorCharacterId: string;
    targetCharacterId: string;
  }): Promise<GuildOpResult> {
    return this.changeRank(input, 1, 2);
  }

  async demoteMember(input: {
    actorCharacterId: string;
    targetCharacterId: string;
  }): Promise<GuildOpResult> {
    return this.changeRank(input, 2, 1);
  }

  async passLeadership(input: {
    actorCharacterId: string;
    targetCharacterId: string;
  }): Promise<GuildOpResult> {
    const failure = this.requireOwner(input.actorCharacterId);
    if (failure) return failure;
    const actor = this.members.get(input.actorCharacterId);
    const guild = actor ? this.guilds.get(actor.guildId) : undefined;
    const target = this.members.get(input.targetCharacterId);
    if (!actor || !guild) return this.fail("not-in-guild");
    if (input.targetCharacterId === input.actorCharacterId) {
      return this.fail("invalid-request");
    }
    if (!target || target.guildId !== actor.guildId) {
      return this.fail("target-not-member");
    }
    target.rankLevel = 3;
    actor.rankLevel = 2;
    guild.ownerCharacterId = input.targetCharacterId;
    return { status: "ok" };
  }

  async disbandGuild(input: {
    actorCharacterId: string;
  }): Promise<GuildOpResult> {
    const failure = this.requireOwner(input.actorCharacterId);
    if (failure) return failure;
    const guildId = this.members.get(input.actorCharacterId)?.guildId;
    if (!guildId) return this.fail("not-in-guild");
    this.guilds.delete(guildId);
    for (const [characterId, member] of [...this.members.entries()]) {
      if (member.guildId === guildId) this.members.delete(characterId);
    }
    for (const [key, invite] of [...this.invites.entries()]) {
      if (invite.guildId === guildId) this.invites.delete(key);
    }
    for (const war of this.wars.values()) {
      if (war.guild1Id === guildId || war.guild2Id === guildId) {
        this.wars.delete(war.id);
      }
    }
    return { status: "ok" };
  }

  async setMotd(input: {
    actorCharacterId: string;
    motd: string;
  }): Promise<GuildOpResult> {
    const failure = this.requireOwner(input.actorCharacterId);
    if (failure) return failure;
    const guildId = this.members.get(input.actorCharacterId)?.guildId;
    const guild = guildId ? this.guilds.get(guildId) : undefined;
    if (!guild) return this.fail("not-in-guild");
    guild.motd = input.motd;
    return { status: "ok" };
  }

  async setNick(input: {
    actorCharacterId: string;
    targetCharacterId: string;
    nick: string;
  }): Promise<GuildOpResult> {
    const actor = this.members.get(input.actorCharacterId);
    if (!actor) return this.fail("not-in-guild");
    const guild = this.guilds.get(actor.guildId);
    const isSelf = input.targetCharacterId === input.actorCharacterId;
    const isLeader = guild?.ownerCharacterId === input.actorCharacterId;
    if (!isSelf && !isLeader) return this.fail("not-authorized");
    const target = this.members.get(input.targetCharacterId);
    if (!target || target.guildId !== actor.guildId) {
      return this.fail("target-not-member");
    }
    target.nick = input.nick;
    return { status: "ok" };
  }

  async setRankName(input: {
    actorCharacterId: string;
    level: number;
    name: string;
  }): Promise<GuildOpResult> {
    const failure = this.requireOwner(input.actorCharacterId);
    if (failure) return failure;
    const guildId = this.members.get(input.actorCharacterId)?.guildId;
    const guild = guildId ? this.guilds.get(guildId) : undefined;
    if (!guild || !guild.rankNames.has(input.level)) {
      return this.fail("invalid-request");
    }
    guild.rankNames.set(input.level, input.name);
    return { status: "ok" };
  }

  async declareWar(input: {
    actorCharacterId: string;
    targetGuildName: string;
    fragLimit: number;
  }): Promise<DeclareWarResult> {
    const failure = this.requireOwner(input.actorCharacterId);
    if (failure) return failure;
    const actor = this.members.get(input.actorCharacterId);
    if (!actor) return this.fail("not-in-guild");
    const normalized = normalizeGuildName(input.targetGuildName);
    const target = [...this.guilds.values()].find(
      (guild) => normalizeGuildName(guild.name) === normalized,
    );
    if (!target) return this.fail("guild-not-found");
    if (target.id === actor.guildId) return this.fail("cannot-war-own-guild");
    for (const war of this.wars.values()) {
      const samePair =
        (war.guild1Id === actor.guildId && war.guild2Id === target.id) ||
        (war.guild1Id === target.id && war.guild2Id === actor.guildId);
      if (samePair && (war.status === WAR_PENDING || war.status === WAR_ACTIVE)) {
        return this.fail("war-already-active");
      }
    }
    const warId = randomUUID();
    this.wars.set(warId, {
      id: warId,
      guild1Id: actor.guildId,
      guild2Id: target.id,
      status: WAR_PENDING,
      fragLimit: input.fragLimit,
      startedAt: monotonicNow(),
      winnerGuildId: null,
    });
    return {
      status: "declared",
      warId,
      targetGuildId: target.id,
      targetGuildName: target.name,
    };
  }

  async respondWar(input: {
    actorCharacterId: string;
    warId: string;
    accept: boolean;
  }): Promise<RespondWarResult> {
    const failure = this.requireOwner(input.actorCharacterId);
    if (failure) return failure;
    const actor = this.members.get(input.actorCharacterId);
    const war = this.wars.get(input.warId);
    if (
      !actor ||
      !war ||
      war.status !== WAR_PENDING ||
      war.guild2Id !== actor.guildId
    ) {
      return this.fail("war-not-found");
    }
    war.status = input.accept ? WAR_ACTIVE : WAR_REJECTED;
    return {
      status: input.accept ? "war-active" : "war-rejected",
      warId: war.id,
      otherGuildId: war.guild1Id,
    };
  }

  async endWar(input: {
    actorCharacterId: string;
    warId: string;
  }): Promise<EndWarResult> {
    const failure = this.requireOwner(input.actorCharacterId);
    if (failure) return failure;
    const actor = this.members.get(input.actorCharacterId);
    const war = this.wars.get(input.warId);
    if (!actor || !war) return this.fail("war-not-found");
    const isSide =
      war.guild1Id === actor.guildId || war.guild2Id === actor.guildId;
    if (!isSide) return this.fail("war-not-found");
    const otherGuildId =
      war.guild1Id === actor.guildId ? war.guild2Id : war.guild1Id;
    if (war.status === WAR_PENDING && war.guild1Id === actor.guildId) {
      war.status = WAR_CANCELED;
      return {
        status: "war-ended",
        warId: war.id,
        otherGuildId,
        winnerGuildId: null,
      };
    }
    if (war.status !== WAR_ACTIVE) return this.fail("war-not-found");
    war.status = WAR_ENDED;
    war.winnerGuildId = otherGuildId;
    return {
      status: "war-ended",
      warId: war.id,
      otherGuildId,
      winnerGuildId: otherGuildId,
    };
  }

  async recordWarKill(input: {
    killerCharacterId: string;
    targetCharacterId: string;
    killerGuildId: string;
    targetGuildId: string;
  }): Promise<RecordWarKillResult> {
    const war = [...this.wars.values()].find(
      (candidate) =>
        candidate.status === WAR_ACTIVE &&
        ((candidate.guild1Id === input.killerGuildId &&
          candidate.guild2Id === input.targetGuildId) ||
          (candidate.guild1Id === input.targetGuildId &&
            candidate.guild2Id === input.killerGuildId)),
    );
    // Ended wars accept no further kills: the "row lock" here is the
    // atomicity of this synchronous block.
    if (!war) return { status: "no-war" };
    this.warKills.push({ warId: war.id, killerGuildId: input.killerGuildId });
    if (this.killCount(war.id, input.killerGuildId) < war.fragLimit) {
      return { status: "recorded", warId: war.id };
    }
    war.status = WAR_ENDED;
    war.winnerGuildId = input.killerGuildId;
    return {
      status: "war-ended",
      warId: war.id,
      winnerGuildId: input.killerGuildId,
    };
  }

  async expirePendingWars(
    cutoff: Date,
  ): Promise<ReadonlyArray<ExpiredWarRecord>> {
    const expired: ExpiredWarRecord[] = [];
    for (const war of this.wars.values()) {
      if (war.status === WAR_PENDING && war.startedAt < cutoff.getTime()) {
        war.status = WAR_REJECTED;
        expired.push({
          warId: war.id,
          guild1Id: war.guild1Id,
          guild2Id: war.guild2Id,
        });
      }
    }
    return expired;
  }

  private async changeRank(
    input: { actorCharacterId: string; targetCharacterId: string },
    fromLevel: number,
    toLevel: number,
  ): Promise<GuildOpResult> {
    const failure = this.requireOwner(input.actorCharacterId);
    if (failure) return failure;
    const actor = this.members.get(input.actorCharacterId);
    const target = this.members.get(input.targetCharacterId);
    if (!actor) return this.fail("not-in-guild");
    if (!target || target.guildId !== actor.guildId) {
      return this.fail("target-not-member");
    }
    if (target.rankLevel !== fromLevel) return this.fail("target-not-member");
    target.rankLevel = toLevel;
    return { status: "ok" };
  }

  private requireOwner(characterId: string): GuildOpFailure | null {
    const member = this.members.get(characterId);
    if (!member) return this.fail("not-in-guild");
    const guild = this.guilds.get(member.guildId);
    if (!guild || guild.ownerCharacterId !== characterId) {
      return this.fail("not-authorized");
    }
    return null;
  }

  private deleteInvitesFor(characterId: string): void {
    for (const [key, invite] of [...this.invites.entries()]) {
      if (invite.characterId === characterId) this.invites.delete(key);
    }
  }

  private killCount(warId: string, guildId: string): number {
    return this.warKills.filter(
      (kill) => kill.warId === warId && kill.killerGuildId === guildId,
    ).length;
  }

  private fail(reason: GuildOpFailure["reason"]): GuildOpFailure {
    return { status: "failed", reason };
  }
}
