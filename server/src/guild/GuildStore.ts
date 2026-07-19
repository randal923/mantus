import type { GuildActionFailedReason, GuildInvitationEntry } from "@tibia/protocol";

export interface GuildRankRecord {
  readonly id: string;
  readonly level: number;
  readonly name: string;
}

export interface GuildMemberRecord {
  readonly characterId: string;
  readonly name: string;
  readonly rankLevel: number;
  readonly nick: string;
}

export interface GuildInviteRecord {
  readonly characterId: string;
  readonly name: string;
}

/** Durable war row statuses: 0 pending, 1 active, 2 rejected, 3 canceled, 4 ended. */
export interface GuildWarRecord {
  readonly id: string;
  readonly guild1Id: string;
  readonly guild2Id: string;
  readonly guild1Name: string;
  readonly guild2Name: string;
  readonly status: number;
  readonly fragLimit: number;
  readonly guild1Kills: number;
  readonly guild2Kills: number;
}

export interface GuildSnapshot {
  readonly id: string;
  readonly name: string;
  readonly motd: string;
  readonly ownerCharacterId: string;
  readonly ranks: ReadonlyArray<GuildRankRecord>;
  readonly members: ReadonlyArray<GuildMemberRecord>;
  readonly invites: ReadonlyArray<GuildInviteRecord>;
  readonly wars: ReadonlyArray<GuildWarRecord>;
}

export interface GuildOpFailure {
  readonly status: "failed";
  readonly reason: GuildActionFailedReason;
}

export type GuildOpResult = { readonly status: "ok" } | GuildOpFailure;

export type CreateGuildResult =
  | { readonly status: "created"; readonly guildId: string }
  | GuildOpFailure;

export type GuildInviteResult =
  | {
      readonly status: "invited";
      readonly guildId: string;
      readonly targetCharacterId: string;
      readonly targetName: string;
    }
  | GuildOpFailure;

export type RespondInviteResult =
  | { readonly status: "joined"; readonly guildId: string }
  | { readonly status: "declined" }
  | GuildOpFailure;

export type DeclareWarResult =
  | {
      readonly status: "declared";
      readonly warId: string;
      readonly targetGuildId: string;
      readonly targetGuildName: string;
    }
  | GuildOpFailure;

export type RespondWarResult =
  | {
      readonly status: "war-active" | "war-rejected";
      readonly warId: string;
      readonly otherGuildId: string;
    }
  | GuildOpFailure;

export type EndWarResult =
  | {
      readonly status: "war-ended";
      readonly warId: string;
      readonly otherGuildId: string;
      readonly winnerGuildId: string | null;
    }
  | GuildOpFailure;

export type RecordWarKillResult =
  | { readonly status: "recorded"; readonly warId: string }
  | {
      readonly status: "war-ended";
      readonly warId: string;
      readonly winnerGuildId: string;
    }
  | { readonly status: "no-war" };

export interface ExpiredWarRecord {
  readonly warId: string;
  readonly guild1Id: string;
  readonly guild2Id: string;
}

/**
 * Durable guild storage. Every mutation is one ACID transaction that
 * re-verifies the actor's membership and rank level from database truth at
 * execution time (charter rule 4); membership, name, and war races resolve
 * through database uniqueness (single-column membership PK, normalized
 * unique guild name, one open war per guild pair).
 */
export interface GuildStore {
  loadGuildIdFor(characterId: string): Promise<string | null>;
  loadSnapshot(guildId: string): Promise<GuildSnapshot | null>;
  loadInvitationsFor(
    characterId: string,
  ): Promise<ReadonlyArray<GuildInvitationEntry>>;
  createGuild(input: {
    ownerCharacterId: string;
    name: string;
  }): Promise<CreateGuildResult>;
  createInvite(input: {
    actorCharacterId: string;
    targetName: string;
  }): Promise<GuildInviteResult>;
  respondInvite(input: {
    characterId: string;
    guildId: string;
    accept: boolean;
  }): Promise<RespondInviteResult>;
  revokeInvite(input: {
    actorCharacterId: string;
    targetCharacterId: string;
  }): Promise<GuildOpResult>;
  kickMember(input: {
    actorCharacterId: string;
    targetCharacterId: string;
  }): Promise<GuildOpResult>;
  leaveGuild(input: { characterId: string }): Promise<GuildOpResult>;
  promoteMember(input: {
    actorCharacterId: string;
    targetCharacterId: string;
  }): Promise<GuildOpResult>;
  demoteMember(input: {
    actorCharacterId: string;
    targetCharacterId: string;
  }): Promise<GuildOpResult>;
  passLeadership(input: {
    actorCharacterId: string;
    targetCharacterId: string;
  }): Promise<GuildOpResult>;
  disbandGuild(input: { actorCharacterId: string }): Promise<GuildOpResult>;
  setMotd(input: {
    actorCharacterId: string;
    motd: string;
  }): Promise<GuildOpResult>;
  setNick(input: {
    actorCharacterId: string;
    targetCharacterId: string;
    nick: string;
  }): Promise<GuildOpResult>;
  setRankName(input: {
    actorCharacterId: string;
    level: number;
    name: string;
  }): Promise<GuildOpResult>;
  declareWar(input: {
    actorCharacterId: string;
    targetGuildName: string;
    fragLimit: number;
  }): Promise<DeclareWarResult>;
  respondWar(input: {
    actorCharacterId: string;
    warId: string;
    accept: boolean;
  }): Promise<RespondWarResult>;
  endWar(input: {
    actorCharacterId: string;
    warId: string;
  }): Promise<EndWarResult>;
  /**
   * Records one war-relevant kill and, when the killer side reaches the
   * frag limit, ends the war in the same transaction. The war row is locked
   * first so two simultaneous limit-reaching kills produce exactly one
   * status transition and one winner.
   */
  recordWarKill(input: {
    killerCharacterId: string;
    targetCharacterId: string;
    killerGuildId: string;
    targetGuildId: string;
  }): Promise<RecordWarKillResult>;
  /** Lazily rejects pending declarations older than the 72 h expiry. */
  expirePendingWars(cutoff: Date): Promise<ReadonlyArray<ExpiredWarRecord>>;
}
