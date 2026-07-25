import type { Pool } from "pg";
import { VIP_LIMITS, type CharacterVocation } from "@tibia/protocol";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import { isUniqueViolation } from "../guild/isUniqueViolation";
import { countVipEntriesQuery } from "./sql/countVipEntriesQuery";
import { deleteVipQuery } from "./sql/deleteVipQuery";
import { insertVipQuery } from "./sql/insertVipQuery";
import { socialCharacterByNameQuery } from "./sql/socialCharacterByNameQuery";
import { updateVipQuery } from "./sql/updateVipQuery";
import { vipEntriesQuery } from "./sql/vipEntriesQuery";
import {
  assignVipGroupQuery,
  countVipGroupsQuery,
  deleteVipGroupQuery,
  insertVipGroupQuery,
  vipGroupRowsQuery,
} from "./sql/vipGroupQueries";
import type {
  AddVipResult,
  CreateVipGroupResult,
  VipEntryRecord,
  VipGroupRecord,
  VipOpFailure,
  VipOpResult,
  VipStore,
} from "./VipStore";

/**
 * Postgres VipStore. Adds run in one SERIALIZABLE transaction that
 * resolves the target name and re-counts the tier limit at execution time, so
 * racing adds cannot push a list past the cap; duplicates and self-adds
 * surface as constraint violations mapped to stable failure reasons.
 */
export class PgVipStore implements VipStore {
  constructor(private readonly pool: Pool) {}

  async loadEntries(
    characterId: string,
  ): Promise<ReadonlyArray<VipEntryRecord>> {
    const result = await this.pool.query<{
      vip_character_id: string;
      display_name: string;
      level: number;
      vocation: CharacterVocation;
      description: string;
      icon: number;
      notify_login: boolean;
      group_id: string | null;
    }>(vipEntriesQuery, [characterId, VIP_LIMITS.maxEntries]);
    return result.rows.map((row) => ({
      vipCharacterId: row.vip_character_id,
      name: row.display_name,
      level: row.level,
      vocation: row.vocation,
      description: row.description,
      icon: row.icon,
      notifyLogin: row.notify_login,
      groupId: row.group_id,
    }));
  }

  async loadGroups(
    characterId: string,
  ): Promise<ReadonlyArray<VipGroupRecord>> {
    const result = await this.pool.query<{ id: string; name: string }>(
      vipGroupRowsQuery,
      [characterId, VIP_LIMITS.maxGroups],
    );
    return result.rows.map((row) => ({ groupId: row.id, name: row.name }));
  }

  async createGroup(input: {
    characterId: string;
    name: string;
    maxGroups: number;
  }): Promise<CreateVipGroupResult> {
    try {
      return await runSerializableTransaction(this.pool, async (client) => {
        const count = await client.query<{ total: number }>(
          countVipGroupsQuery,
          [input.characterId],
        );
        if ((count.rows[0]?.total ?? 0) >= input.maxGroups) {
          throw this.rollback("list-full");
        }
        const created = await client.query<{ id: string; name: string }>(
          insertVipGroupQuery,
          [input.characterId, input.name],
        );
        const row = created.rows[0];
        if (!row) throw this.rollback("invalid-request");
        return {
          status: "created" as const,
          group: { groupId: row.id, name: row.name },
        };
      });
    } catch (cause) {
      if (isUniqueViolation(cause, "character_vip_groups_character_id_name_key")) {
        return { status: "failed", reason: "already-added" };
      }
      throw cause;
    }
  }

  async deleteGroup(input: {
    characterId: string;
    groupId: string;
  }): Promise<VipOpResult> {
    const deleted = await this.pool.query(deleteVipGroupQuery, [
      input.characterId,
      input.groupId,
    ]);
    if (deleted.rowCount !== 1) return { status: "failed", reason: "not-found" };
    return { status: "ok" };
  }

  async assignGroup(input: {
    characterId: string;
    vipCharacterId: string;
    groupId: string | null;
  }): Promise<VipOpResult> {
    const updated = await this.pool.query(assignVipGroupQuery, [
      input.characterId,
      input.vipCharacterId,
      input.groupId,
    ]);
    if (updated.rowCount !== 1) return { status: "failed", reason: "not-found" };
    return { status: "ok" };
  }

  async addVip(input: {
    characterId: string;
    targetName: string;
    maxEntries: number;
  }): Promise<AddVipResult> {
    try {
      return await runSerializableTransaction(this.pool, async (client) => {
        const target = await client.query<{
          id: string;
          display_name: string;
          level: number;
          vocation: CharacterVocation;
        }>(socialCharacterByNameQuery, [input.targetName]);
        const targetRow = target.rows[0];
        if (!targetRow) throw this.rollback("not-found");
        if (targetRow.id === input.characterId) {
          throw this.rollback("cannot-add-self");
        }
        const count = await client.query<{ total: number }>(
          countVipEntriesQuery,
          [input.characterId],
        );
        if ((count.rows[0]?.total ?? 0) >= input.maxEntries) {
          throw this.rollback("list-full");
        }
        await client.query(insertVipQuery, [input.characterId, targetRow.id]);
        return {
          status: "added" as const,
          entry: {
            vipCharacterId: targetRow.id,
            name: targetRow.display_name,
            level: targetRow.level,
            vocation: targetRow.vocation,
            description: "",
            icon: 0,
            notifyLogin: false,
            groupId: null,
          },
        };
      });
    } catch (cause) {
      if (isUniqueViolation(cause, "character_vips_pkey")) {
        return { status: "failed", reason: "already-added" };
      }
      throw cause;
    }
  }

  async removeVip(input: {
    characterId: string;
    vipCharacterId: string;
  }): Promise<VipOpResult> {
    const removed = await this.pool.query(deleteVipQuery, [
      input.characterId,
      input.vipCharacterId,
    ]);
    if (removed.rowCount !== 1) return { status: "failed", reason: "not-found" };
    return { status: "ok" };
  }

  async editVip(input: {
    characterId: string;
    vipCharacterId: string;
    description?: string;
    icon?: number;
    notifyLogin?: boolean;
  }): Promise<VipOpResult> {
    const updated = await this.pool.query(updateVipQuery, [
      input.characterId,
      input.vipCharacterId,
      input.description ?? null,
      input.icon ?? null,
      input.notifyLogin ?? null,
    ]);
    if (updated.rowCount !== 1) return { status: "failed", reason: "not-found" };
    return { status: "ok" };
  }

  private rollback(
    reason: VipOpFailure["reason"],
  ): TransactionRollback<VipOpFailure> {
    return new TransactionRollback<VipOpFailure>({ status: "failed", reason });
  }
}
