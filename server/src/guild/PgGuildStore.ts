import type { Pool, PoolClient } from "pg";
import type { GuildInvitationEntry } from "@tibia/protocol";
import { GUILD_LIMITS } from "@tibia/protocol";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
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
import { isSerializationFailure } from "./isSerializationFailure";
import { isUniqueViolation } from "./isUniqueViolation";
import { actorMembershipForUpdateQuery } from "./sql/actorMembershipForUpdateQuery";
import { activeWarBetweenForUpdateQuery } from "./sql/activeWarBetweenForUpdateQuery";
import { characterByNameQuery } from "./sql/characterByNameQuery";
import { countGuildInvitesQuery } from "./sql/countGuildInvitesQuery";
import { countWarKillsForGuildQuery } from "./sql/countWarKillsForGuildQuery";
import { deleteGuildInviteQuery } from "./sql/deleteGuildInviteQuery";
import { deleteGuildMemberQuery } from "./sql/deleteGuildMemberQuery";
import { deleteGuildQuery } from "./sql/deleteGuildQuery";
import { deleteInvitesForCharacterQuery } from "./sql/deleteInvitesForCharacterQuery";
import { expirePendingWarsQuery } from "./sql/expirePendingWarsQuery";
import { guildIdForCharacterQuery } from "./sql/guildIdForCharacterQuery";
import { guildInvitesQuery } from "./sql/guildInvitesQuery";
import { guildMembersQuery } from "./sql/guildMembersQuery";
import { guildRanksQuery } from "./sql/guildRanksQuery";
import { guildRowByNameQuery } from "./sql/guildRowByNameQuery";
import { guildRowQuery } from "./sql/guildRowQuery";
import { guildWarsQuery } from "./sql/guildWarsQuery";
import { insertGuildInviteQuery } from "./sql/insertGuildInviteQuery";
import { insertGuildMemberQuery } from "./sql/insertGuildMemberQuery";
import { insertGuildQuery } from "./sql/insertGuildQuery";
import { insertGuildRankQuery } from "./sql/insertGuildRankQuery";
import { insertGuildWarQuery } from "./sql/insertGuildWarQuery";
import { insertWarKillQuery } from "./sql/insertWarKillQuery";
import { invitationsForCharacterQuery } from "./sql/invitationsForCharacterQuery";
import { membershipForUpdateQuery } from "./sql/membershipForUpdateQuery";
import { rankIdByLevelQuery } from "./sql/rankIdByLevelQuery";
import { updateGuildMotdQuery } from "./sql/updateGuildMotdQuery";
import { updateGuildOwnerQuery } from "./sql/updateGuildOwnerQuery";
import { updateMemberNickQuery } from "./sql/updateMemberNickQuery";
import { updateMemberRankQuery } from "./sql/updateMemberRankQuery";
import { updateRankNameQuery } from "./sql/updateRankNameQuery";
import { updateWarStatusQuery } from "./sql/updateWarStatusQuery";
import { warForUpdateQuery } from "./sql/warForUpdateQuery";

interface MembershipRow {
  character_id: string;
  guild_id: string;
  level: number;
  owner_character_id?: string;
}

const DEFAULT_RANK_NAMES: ReadonlyArray<readonly [number, string]> = [
  [3, "The Leader"],
  [2, "Vice-Leader"],
  [1, "Member"],
];

const WAR_PENDING = 0;
const WAR_ACTIVE = 1;
const WAR_REJECTED = 2;
const WAR_CANCELED = 3;
const WAR_ENDED = 4;
const MAX_TRANSACTION_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 15;

/**
 * Postgres GuildStore. Every mutation is one SERIALIZABLE transaction that
 * locks and re-reads the actor's membership row before acting, so demoted
 * or kicked actors are rejected at execution time regardless of what their
 * client believed. Creation/membership/war races surface as unique
 * violations on the dedicated indexes and map to stable failure reasons.
 */
export class PgGuildStore implements GuildStore {
  constructor(private readonly pool: Pool) {}

  async loadGuildIdFor(characterId: string): Promise<string | null> {
    const result = await this.pool.query<{ guild_id: string }>(
      guildIdForCharacterQuery,
      [characterId],
    );
    return result.rows[0]?.guild_id ?? null;
  }

  async loadSnapshot(guildId: string): Promise<GuildSnapshot | null> {
    const guild = await this.pool.query<{
      id: string;
      name: string;
      motd: string;
      owner_character_id: string;
    }>(guildRowQuery, [guildId]);
    const row = guild.rows[0];
    if (!row) return null;
    const [ranks, members, invites, wars] = await Promise.all([
      this.pool.query<{ id: string; level: number; name: string }>(
        guildRanksQuery,
        [guildId],
      ),
      this.pool.query<{
        character_id: string;
        name: string;
        rank_level: number;
        nick: string;
      }>(guildMembersQuery, [guildId]),
      this.pool.query<{ character_id: string; name: string }>(
        guildInvitesQuery,
        [guildId],
      ),
      this.pool.query<{
        id: string;
        guild1_id: string;
        guild2_id: string;
        guild1_name: string;
        guild2_name: string;
        status: number;
        frag_limit: number;
        guild1_kills: number;
        guild2_kills: number;
      }>(guildWarsQuery, [guildId]),
    ]);
    return {
      id: row.id,
      name: row.name,
      motd: row.motd,
      ownerCharacterId: row.owner_character_id,
      ranks: ranks.rows.map((rank) => ({
        id: rank.id,
        level: rank.level,
        name: rank.name,
      })),
      members: members.rows.map((member) => ({
        characterId: member.character_id,
        name: member.name,
        rankLevel: member.rank_level,
        nick: member.nick,
      })),
      invites: invites.rows.map((invite) => ({
        characterId: invite.character_id,
        name: invite.name,
      })),
      wars: wars.rows.map((war) => ({
        id: war.id,
        guild1Id: war.guild1_id,
        guild2Id: war.guild2_id,
        guild1Name: war.guild1_name,
        guild2Name: war.guild2_name,
        status: war.status,
        fragLimit: war.frag_limit,
        guild1Kills: war.guild1_kills,
        guild2Kills: war.guild2_kills,
      })),
    };
  }

  async loadInvitationsFor(
    characterId: string,
  ): Promise<ReadonlyArray<GuildInvitationEntry>> {
    const result = await this.pool.query<{
      guild_id: string;
      guild_name: string;
      inviter_name: string;
    }>(invitationsForCharacterQuery, [characterId]);
    return result.rows.map((row) => ({
      guildId: row.guild_id,
      guildName: row.guild_name,
      inviterName: row.inviter_name,
    }));
  }

  async createGuild(input: {
    ownerCharacterId: string;
    name: string;
  }): Promise<CreateGuildResult> {
    try {
      return await this.transact(async (client) => {
        const existing = await client.query(guildIdForCharacterQuery, [
          input.ownerCharacterId,
        ]);
        if (existing.rows.length > 0) {
          throw this.rollback("already-in-guild");
        }
        const created = await client.query<{ id: string }>(insertGuildQuery, [
          input.name.trim(),
          input.ownerCharacterId,
        ]);
        const guildId = created.rows[0]?.id;
        if (!guildId) throw this.rollback("invalid-request");
        let leaderRankId: string | null = null;
        for (const [level, name] of DEFAULT_RANK_NAMES) {
          const rank = await client.query<{ id: string }>(
            insertGuildRankQuery,
            [guildId, level, name],
          );
          if (level === 3) leaderRankId = rank.rows[0]?.id ?? null;
        }
        if (!leaderRankId) throw this.rollback("invalid-request");
        await client.query(insertGuildMemberQuery, [
          input.ownerCharacterId,
          guildId,
          leaderRankId,
        ]);
        await client.query(deleteInvitesForCharacterQuery, [
          input.ownerCharacterId,
        ]);
        return { status: "created" as const, guildId };
      });
    } catch (cause) {
      if (isUniqueViolation(cause, "guilds_normalized_name_idx")) {
        return { status: "failed", reason: "name-taken" };
      }
      if (isUniqueViolation(cause, "guilds_owner_character_id_key")) {
        return { status: "failed", reason: "already-in-guild" };
      }
      if (isUniqueViolation(cause, "guild_members_pkey")) {
        return { status: "failed", reason: "already-in-guild" };
      }
      throw cause;
    }
  }

  async createInvite(input: {
    actorCharacterId: string;
    targetName: string;
  }): Promise<GuildInviteResult> {
    try {
      return await this.transact(async (client) => {
        const actor = await this.requireRank(client, input.actorCharacterId, 2);
        const target = await client.query<{ id: string; display_name: string }>(
          characterByNameQuery,
          [input.targetName],
        );
        const targetRow = target.rows[0];
        if (!targetRow) throw this.rollback("target-not-found");
        const targetMembership = await client.query(guildIdForCharacterQuery, [
          targetRow.id,
        ]);
        if (targetMembership.rows.length > 0) {
          throw this.rollback("target-already-in-guild");
        }
        const count = await client.query<{ total: number }>(
          countGuildInvitesQuery,
          [actor.guild_id],
        );
        if ((count.rows[0]?.total ?? 0) >= GUILD_LIMITS.maxInvitesPerGuild) {
          throw this.rollback("invite-limit");
        }
        await client.query(insertGuildInviteQuery, [
          targetRow.id,
          actor.guild_id,
          input.actorCharacterId,
        ]);
        return {
          status: "invited" as const,
          guildId: actor.guild_id,
          targetCharacterId: targetRow.id,
          targetName: targetRow.display_name,
        };
      });
    } catch (cause) {
      if (isUniqueViolation(cause, "guild_invites_pkey")) {
        return { status: "failed", reason: "already-invited" };
      }
      throw cause;
    }
  }

  async respondInvite(input: {
    characterId: string;
    guildId: string;
    accept: boolean;
  }): Promise<RespondInviteResult> {
    try {
      return await this.transact(async (client) => {
        // Re-check the invite exists at execution time.
        const removed = await client.query(deleteGuildInviteQuery, [
          input.characterId,
          input.guildId,
        ]);
        if (removed.rowCount !== 1) throw this.rollback("invite-not-found");
        if (!input.accept) return { status: "declined" as const };
        const membership = await client.query(guildIdForCharacterQuery, [
          input.characterId,
        ]);
        if (membership.rows.length > 0) {
          throw this.rollback("already-in-guild");
        }
        const rank = await client.query<{ id: string }>(rankIdByLevelQuery, [
          input.guildId,
          1,
        ]);
        const rankId = rank.rows[0]?.id;
        if (!rankId) throw this.rollback("guild-not-found");
        await client.query(insertGuildMemberQuery, [
          input.characterId,
          input.guildId,
          rankId,
        ]);
        await client.query(deleteInvitesForCharacterQuery, [
          input.characterId,
        ]);
        return { status: "joined" as const, guildId: input.guildId };
      });
    } catch (cause) {
      // Concurrent accepts race on the single-column membership PK.
      if (isUniqueViolation(cause, "guild_members_pkey")) {
        return { status: "failed", reason: "already-in-guild" };
      }
      throw cause;
    }
  }

  async revokeInvite(input: {
    actorCharacterId: string;
    targetCharacterId: string;
  }): Promise<GuildOpResult> {
    return this.transact(async (client) => {
      const actor = await this.requireRank(client, input.actorCharacterId, 2);
      const removed = await client.query(deleteGuildInviteQuery, [
        input.targetCharacterId,
        actor.guild_id,
      ]);
      if (removed.rowCount !== 1) throw this.rollback("invite-not-found");
      return { status: "ok" as const };
    });
  }

  async kickMember(input: {
    actorCharacterId: string;
    targetCharacterId: string;
  }): Promise<GuildOpResult> {
    return this.transact(async (client) => {
      const actor = await this.requireRank(client, input.actorCharacterId, 2);
      const target = await this.targetMembership(
        client,
        input.targetCharacterId,
        actor.guild_id,
      );
      // Vice-leaders may only remove strictly lower ranks; nobody kicks the
      // leader (owner) this way.
      if (target.level >= actor.level) {
        throw this.rollback("cannot-kick-higher-rank");
      }
      await client.query(deleteGuildMemberQuery, [
        input.targetCharacterId,
        actor.guild_id,
      ]);
      return { status: "ok" as const };
    });
  }

  async leaveGuild(input: { characterId: string }): Promise<GuildOpResult> {
    return this.transact(async (client) => {
      const actor = await this.actorMembership(client, input.characterId);
      if (actor.owner_character_id === input.characterId) {
        throw this.rollback("leader-cannot-leave");
      }
      await client.query(deleteGuildMemberQuery, [
        input.characterId,
        actor.guild_id,
      ]);
      return { status: "ok" as const };
    });
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
    return this.transact(async (client) => {
      const actor = await this.requireOwner(client, input.actorCharacterId);
      if (input.targetCharacterId === input.actorCharacterId) {
        throw this.rollback("invalid-request");
      }
      const target = await this.targetMembership(
        client,
        input.targetCharacterId,
        actor.guild_id,
      );
      const leaderRank = await client.query<{ id: string }>(
        rankIdByLevelQuery,
        [actor.guild_id, 3],
      );
      const viceRank = await client.query<{ id: string }>(rankIdByLevelQuery, [
        actor.guild_id,
        2,
      ]);
      const leaderRankId = leaderRank.rows[0]?.id;
      const viceRankId = viceRank.rows[0]?.id;
      if (!leaderRankId || !viceRankId) throw this.rollback("invalid-request");
      await client.query(updateMemberRankQuery, [
        target.character_id,
        leaderRankId,
      ]);
      await client.query(updateMemberRankQuery, [
        input.actorCharacterId,
        viceRankId,
      ]);
      await client.query(updateGuildOwnerQuery, [
        actor.guild_id,
        input.targetCharacterId,
      ]);
      return { status: "ok" as const };
    });
  }

  async disbandGuild(input: {
    actorCharacterId: string;
  }): Promise<GuildOpResult> {
    return this.transact(async (client) => {
      const actor = await this.requireOwner(client, input.actorCharacterId);
      await client.query(deleteGuildQuery, [actor.guild_id]);
      return { status: "ok" as const };
    });
  }

  async setMotd(input: {
    actorCharacterId: string;
    motd: string;
  }): Promise<GuildOpResult> {
    return this.transact(async (client) => {
      const actor = await this.requireOwner(client, input.actorCharacterId);
      await client.query(updateGuildMotdQuery, [actor.guild_id, input.motd]);
      return { status: "ok" as const };
    });
  }

  async setNick(input: {
    actorCharacterId: string;
    targetCharacterId: string;
    nick: string;
  }): Promise<GuildOpResult> {
    return this.transact(async (client) => {
      const actor = await this.actorMembership(client, input.actorCharacterId);
      const isSelf = input.targetCharacterId === input.actorCharacterId;
      const isLeader = actor.owner_character_id === input.actorCharacterId;
      if (!isSelf && !isLeader) throw this.rollback("not-authorized");
      const target = isSelf
        ? actor
        : await this.targetMembership(
            client,
            input.targetCharacterId,
            actor.guild_id,
          );
      await client.query(updateMemberNickQuery, [
        target.character_id,
        input.nick,
      ]);
      return { status: "ok" as const };
    });
  }

  async setRankName(input: {
    actorCharacterId: string;
    level: number;
    name: string;
  }): Promise<GuildOpResult> {
    return this.transact(async (client) => {
      const actor = await this.requireOwner(client, input.actorCharacterId);
      const updated = await client.query(updateRankNameQuery, [
        actor.guild_id,
        input.level,
        input.name,
      ]);
      if (updated.rowCount !== 1) throw this.rollback("invalid-request");
      return { status: "ok" as const };
    });
  }

  async declareWar(input: {
    actorCharacterId: string;
    targetGuildName: string;
    fragLimit: number;
  }): Promise<DeclareWarResult> {
    try {
      return await this.transact(async (client) => {
        const actor = await this.requireOwner(client, input.actorCharacterId);
        const target = await client.query<{ id: string; name: string }>(
          guildRowByNameQuery,
          [input.targetGuildName],
        );
        const targetRow = target.rows[0];
        if (!targetRow) throw this.rollback("guild-not-found");
        if (targetRow.id === actor.guild_id) {
          throw this.rollback("cannot-war-own-guild");
        }
        const created = await client.query<{ id: string }>(
          insertGuildWarQuery,
          [actor.guild_id, targetRow.id, input.fragLimit],
        );
        const warId = created.rows[0]?.id;
        if (!warId) throw this.rollback("invalid-request");
        return {
          status: "declared" as const,
          warId,
          targetGuildId: targetRow.id,
          targetGuildName: targetRow.name,
        };
      });
    } catch (cause) {
      if (isUniqueViolation(cause, "guild_wars_open_pair_idx")) {
        return { status: "failed", reason: "war-already-active" };
      }
      throw cause;
    }
  }

  async respondWar(input: {
    actorCharacterId: string;
    warId: string;
    accept: boolean;
  }): Promise<RespondWarResult> {
    return this.transact(async (client) => {
      const actor = await this.requireOwner(client, input.actorCharacterId);
      const war = await this.lockWar(client, input.warId);
      // Only the leader of the declared-against guild answers a pending war.
      if (war.status !== WAR_PENDING || war.guild2_id !== actor.guild_id) {
        throw this.rollback("war-not-found");
      }
      const status = input.accept ? WAR_ACTIVE : WAR_REJECTED;
      await client.query(updateWarStatusQuery, [war.id, status, null]);
      return {
        status: input.accept ? ("war-active" as const) : ("war-rejected" as const),
        warId: war.id,
        otherGuildId: war.guild1_id,
      };
    });
  }

  async endWar(input: {
    actorCharacterId: string;
    warId: string;
  }): Promise<EndWarResult> {
    return this.transact(async (client) => {
      const actor = await this.requireOwner(client, input.actorCharacterId);
      const war = await this.lockWar(client, input.warId);
      const isSide =
        war.guild1_id === actor.guild_id || war.guild2_id === actor.guild_id;
      if (!isSide) throw this.rollback("war-not-found");
      const otherGuildId =
        war.guild1_id === actor.guild_id ? war.guild2_id : war.guild1_id;
      if (war.status === WAR_PENDING && war.guild1_id === actor.guild_id) {
        // Withdrawing an unanswered declaration cancels it without a winner.
        await client.query(updateWarStatusQuery, [war.id, WAR_CANCELED, null]);
        return {
          status: "war-ended" as const,
          warId: war.id,
          otherGuildId,
          winnerGuildId: null,
        };
      }
      if (war.status !== WAR_ACTIVE) throw this.rollback("war-not-found");
      // Surrender: the opposing guild takes the win.
      await client.query(updateWarStatusQuery, [war.id, WAR_ENDED, otherGuildId]);
      return {
        status: "war-ended" as const,
        warId: war.id,
        otherGuildId,
        winnerGuildId: otherGuildId,
      };
    });
  }

  async recordWarKill(input: {
    killerCharacterId: string;
    targetCharacterId: string;
    killerGuildId: string;
    targetGuildId: string;
  }): Promise<RecordWarKillResult> {
    return this.transact(async (client) => {
      // Lock the single active war between the pair: concurrent
      // limit-reaching kills serialize here, so exactly one transaction
      // observes the limit first and performs the end transition.
      const war = await client.query<{
        id: string;
        guild1_id: string;
        guild2_id: string;
        frag_limit: number;
      }>(activeWarBetweenForUpdateQuery, [
        input.killerGuildId,
        input.targetGuildId,
      ]);
      const warRow = war.rows[0];
      if (!warRow) {
        throw new TransactionRollback<RecordWarKillResult>({
          status: "no-war",
        });
      }
      await client.query(insertWarKillQuery, [
        warRow.id,
        input.killerCharacterId,
        input.targetCharacterId,
        input.killerGuildId,
        input.targetGuildId,
      ]);
      const kills = await client.query<{ total: number }>(
        countWarKillsForGuildQuery,
        [warRow.id, input.killerGuildId],
      );
      if ((kills.rows[0]?.total ?? 0) < warRow.frag_limit) {
        return { status: "recorded" as const, warId: warRow.id };
      }
      await client.query(updateWarStatusQuery, [
        warRow.id,
        WAR_ENDED,
        input.killerGuildId,
      ]);
      return {
        status: "war-ended" as const,
        warId: warRow.id,
        winnerGuildId: input.killerGuildId,
      };
    });
  }

  async expirePendingWars(
    cutoff: Date,
  ): Promise<ReadonlyArray<ExpiredWarRecord>> {
    const result = await this.pool.query<{
      id: string;
      guild1_id: string;
      guild2_id: string;
    }>(expirePendingWarsQuery, [cutoff.toISOString()]);
    return result.rows.map((row) => ({
      warId: row.id,
      guild1Id: row.guild1_id,
      guild2Id: row.guild2_id,
    }));
  }

  /**
   * One SERIALIZABLE transaction, retried a bounded number of times on
   * serialization aborts so concurrent guild mutations settle rather than
   * surfacing spurious failures (the retry re-runs every execution-time
   * check against the winner's committed state).
   */
  private async transact<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    let lastCause: unknown;
    for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      if (attempt > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, RETRY_BACKOFF_MS * attempt);
        });
      }
      try {
        return await runSerializableTransaction(this.pool, operation);
      } catch (cause) {
        if (!isSerializationFailure(cause)) throw cause;
        lastCause = cause;
      }
    }
    throw lastCause;
  }

  private async changeRank(
    input: { actorCharacterId: string; targetCharacterId: string },
    fromLevel: number,
    toLevel: number,
  ): Promise<GuildOpResult> {
    return this.transact(async (client) => {
      const actor = await this.requireOwner(client, input.actorCharacterId);
      const target = await this.targetMembership(
        client,
        input.targetCharacterId,
        actor.guild_id,
      );
      if (target.level !== fromLevel) throw this.rollback("target-not-member");
      const rank = await client.query<{ id: string }>(rankIdByLevelQuery, [
        actor.guild_id,
        toLevel,
      ]);
      const rankId = rank.rows[0]?.id;
      if (!rankId) throw this.rollback("invalid-request");
      await client.query(updateMemberRankQuery, [target.character_id, rankId]);
      return { status: "ok" as const };
    });
  }

  /** Locks and returns the actor's membership; not-in-guild otherwise. */
  private async actorMembership(
    client: PoolClient,
    characterId: string,
  ): Promise<MembershipRow & { owner_character_id: string }> {
    const result = await client.query<
      MembershipRow & { owner_character_id: string }
    >(actorMembershipForUpdateQuery, [characterId]);
    const row = result.rows[0];
    if (!row) throw this.rollback("not-in-guild");
    return row;
  }

  private async requireRank(
    client: PoolClient,
    characterId: string,
    minimumLevel: number,
  ): Promise<MembershipRow & { owner_character_id: string }> {
    const actor = await this.actorMembership(client, characterId);
    if (actor.level < minimumLevel) throw this.rollback("not-authorized");
    return actor;
  }

  private async requireOwner(
    client: PoolClient,
    characterId: string,
  ): Promise<MembershipRow & { owner_character_id: string }> {
    const actor = await this.actorMembership(client, characterId);
    if (actor.owner_character_id !== characterId) {
      throw this.rollback("not-authorized");
    }
    return actor;
  }

  private async lockWar(
    client: PoolClient,
    warId: string,
  ): Promise<{
    id: string;
    guild1_id: string;
    guild2_id: string;
    status: number;
    frag_limit: number;
  }> {
    const result = await client.query<{
      id: string;
      guild1_id: string;
      guild2_id: string;
      status: number;
      frag_limit: number;
    }>(warForUpdateQuery, [warId]);
    const row = result.rows[0];
    if (!row) throw this.rollback("war-not-found");
    return row;
  }

  private async targetMembership(
    client: PoolClient,
    characterId: string,
    guildId: string,
  ): Promise<MembershipRow> {
    const result = await client.query<MembershipRow>(membershipForUpdateQuery, [
      characterId,
    ]);
    const row = result.rows[0];
    if (!row || row.guild_id !== guildId) {
      throw this.rollback("target-not-member");
    }
    return row;
  }

  private rollback(
    reason: GuildOpFailure["reason"],
  ): TransactionRollback<GuildOpFailure> {
    return new TransactionRollback<GuildOpFailure>({
      status: "failed",
      reason,
    });
  }
}
