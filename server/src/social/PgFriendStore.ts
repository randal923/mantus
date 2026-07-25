import { VIP_LIMITS } from "@tibia/protocol";
import type { Pool, PoolClient } from "pg";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import type {
  FriendOpFailure,
  FriendOpResult,
  FriendRecord,
  FriendSnapshot,
  FriendStore,
} from "./FriendStore";
import {
  characterNameQuery,
  countFriendsQuery,
  countIncomingRequestsQuery,
  countOutgoingRequestsQuery,
  deleteFriendRequestQuery,
  deleteFriendshipQuery,
  friendRowsQuery,
  friendshipExistsQuery,
  incomingRequestRowsQuery,
  insertFriendRequestQuery,
  insertFriendshipQuery,
  outgoingRequestRowsQuery,
  requestExistsForUpdateQuery,
  socialSettingsQuery,
  upsertSocialSettingsQuery,
} from "./sql/friendQueries";
import { socialCharacterByNameQuery } from "./sql/socialCharacterByNameQuery";

interface NameRow {
  character_id: string;
  display_name: string;
}

/**
 * Postgres FriendStore. Requests and acceptances run in one SERIALIZABLE
 * transaction that re-resolves the target, re-counts both caps, and — for an
 * acceptance — locks the request row before writing the two friendship halves
 * together, so a friendship is never half-written and an accept can never
 * outrun a withdrawal.
 */
export class PgFriendStore implements FriendStore {
  constructor(private readonly pool: Pool) {}

  async loadSnapshot(characterId: string): Promise<FriendSnapshot> {
    return this.snapshot(this.pool, characterId);
  }

  async request(input: {
    characterId: string;
    targetName: string;
    maxRequests: number;
    maxFriends: number;
  }): Promise<FriendOpResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const target = await client.query<{ id: string; display_name: string }>(
        socialCharacterByNameQuery,
        [input.targetName],
      );
      const targetRow = target.rows[0];
      if (!targetRow) throw this.rollback("not-found");
      if (targetRow.id === input.characterId) {
        throw this.rollback("cannot-add-self");
      }
      const existing = await client.query(friendshipExistsQuery, [
        input.characterId,
        targetRow.id,
      ]);
      if (existing.rowCount && existing.rowCount > 0) {
        throw this.rollback("already-friends");
      }
      const outgoing = await client.query<{ total: number }>(
        countOutgoingRequestsQuery,
        [input.characterId],
      );
      if ((outgoing.rows[0]?.total ?? 0) >= input.maxRequests) {
        throw this.rollback("list-full");
      }
      const friends = await client.query<{ total: number }>(countFriendsQuery, [
        input.characterId,
      ]);
      if ((friends.rows[0]?.total ?? 0) >= input.maxFriends) {
        throw this.rollback("list-full");
      }
      const incoming = await client.query(requestExistsForUpdateQuery, [
        targetRow.id,
        input.characterId,
      ]);
      // Crossing requests settle immediately: the other side already asked.
      if (incoming.rowCount && incoming.rowCount > 0) {
        await client.query(deleteFriendRequestQuery, [
          targetRow.id,
          input.characterId,
        ]);
        await client.query(insertFriendshipQuery, [
          input.characterId,
          targetRow.id,
        ]);
        return {
          status: "ok" as const,
          snapshot: await this.snapshot(client, input.characterId),
          notify: { characterId: targetRow.id, name: targetRow.display_name },
        };
      }
      const mine = await client.query(requestExistsForUpdateQuery, [
        input.characterId,
        targetRow.id,
      ]);
      if (mine.rowCount && mine.rowCount > 0) {
        throw this.rollback("request-pending");
      }
      const capacity = await client.query<{ total: number }>(
        countIncomingRequestsQuery,
        [targetRow.id],
      );
      if ((capacity.rows[0]?.total ?? 0) >= input.maxRequests) {
        throw this.rollback("list-full");
      }
      await client.query(insertFriendRequestQuery, [
        input.characterId,
        targetRow.id,
      ]);
      return {
        status: "ok" as const,
        snapshot: await this.snapshot(client, input.characterId),
        notify: { characterId: targetRow.id, name: targetRow.display_name },
      };
    });
  }

  async respond(input: {
    characterId: string;
    fromCharacterId: string;
    accept: boolean;
    maxFriends: number;
  }): Promise<FriendOpResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      // The row is the authority: a forged requester id locks nothing.
      const pending = await client.query(requestExistsForUpdateQuery, [
        input.fromCharacterId,
        input.characterId,
      ]);
      if (!pending.rowCount) throw this.rollback("request-not-found");
      await client.query(deleteFriendRequestQuery, [
        input.fromCharacterId,
        input.characterId,
      ]);
      if (input.accept) {
        for (const id of [input.characterId, input.fromCharacterId]) {
          const friends = await client.query<{ total: number }>(
            countFriendsQuery,
            [id],
          );
          if ((friends.rows[0]?.total ?? 0) >= input.maxFriends) {
            throw this.rollback("list-full");
          }
        }
        await client.query(insertFriendshipQuery, [
          input.characterId,
          input.fromCharacterId,
        ]);
      }
      const name = await client.query<{ display_name: string }>(
        characterNameQuery,
        [input.fromCharacterId],
      );
      return {
        status: "ok" as const,
        snapshot: await this.snapshot(client, input.characterId),
        notify: {
          characterId: input.fromCharacterId,
          name: name.rows[0]?.display_name ?? "?",
        },
      };
    });
  }

  async remove(input: {
    characterId: string;
    targetCharacterId: string;
  }): Promise<FriendOpResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const friendship = await client.query(deleteFriendshipQuery, [
        input.characterId,
        input.targetCharacterId,
      ]);
      const request = await client.query(deleteFriendRequestQuery, [
        input.characterId,
        input.targetCharacterId,
      ]);
      if (!friendship.rowCount && !request.rowCount) {
        throw this.rollback("not-found");
      }
      const name = await client.query<{ display_name: string }>(
        characterNameQuery,
        [input.targetCharacterId],
      );
      return {
        status: "ok" as const,
        snapshot: await this.snapshot(client, input.characterId),
        notify: {
          characterId: input.targetCharacterId,
          name: name.rows[0]?.display_name ?? "?",
        },
      };
    });
  }

  async setFinderVisible(input: {
    characterId: string;
    finderVisible: boolean;
  }): Promise<FriendOpResult> {
    await this.pool.query(upsertSocialSettingsQuery, [
      input.characterId,
      input.finderVisible,
    ]);
    return {
      status: "ok",
      snapshot: await this.snapshot(this.pool, input.characterId),
    };
  }

  private async snapshot(
    client: Pool | PoolClient,
    characterId: string,
  ): Promise<FriendSnapshot> {
    // Sequential: inside a transaction this is a single connection, and a
    // pooled client cannot run two statements at once.
    const friends = await client.query<NameRow>(friendRowsQuery, [
      characterId,
      VIP_LIMITS.maxFriends,
    ]);
    const incoming = await client.query<NameRow>(incomingRequestRowsQuery, [
      characterId,
      VIP_LIMITS.maxFriendRequests,
    ]);
    const outgoing = await client.query<NameRow>(outgoingRequestRowsQuery, [
      characterId,
      VIP_LIMITS.maxFriendRequests,
    ]);
    const settings = await client.query<{ finder_visible: boolean }>(
      socialSettingsQuery,
      [characterId],
    );
    const records = (rows: ReadonlyArray<NameRow>): FriendRecord[] =>
      rows.map((row) => ({
        characterId: row.character_id,
        name: row.display_name,
      }));
    return {
      friends: records(friends.rows),
      incoming: records(incoming.rows),
      outgoing: records(outgoing.rows),
      finderVisible: settings.rows[0]?.finder_visible ?? true,
    };
  }

  private rollback(
    reason: FriendOpFailure["reason"],
  ): TransactionRollback<FriendOpFailure> {
    return new TransactionRollback<FriendOpFailure>({
      status: "failed",
      reason,
    });
  }
}
