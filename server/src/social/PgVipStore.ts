import type { Pool } from "pg";
import { VIP_LIMITS } from "@tibia/protocol";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import { isSerializationFailure } from "../guild/isSerializationFailure";
import { isUniqueViolation } from "../guild/isUniqueViolation";
import { countVipEntriesQuery } from "./sql/countVipEntriesQuery";
import { deleteVipQuery } from "./sql/deleteVipQuery";
import { insertVipQuery } from "./sql/insertVipQuery";
import { socialCharacterByNameQuery } from "./sql/socialCharacterByNameQuery";
import { updateVipQuery } from "./sql/updateVipQuery";
import { vipEntriesQuery } from "./sql/vipEntriesQuery";
import type {
  AddVipResult,
  VipEntryRecord,
  VipOpFailure,
  VipOpResult,
  VipStore,
} from "./VipStore";

/**
 * Postgres VipStore. Adds run in one SERIALIZABLE transaction that
 * resolves the target name and re-counts the list at execution time, so
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
      description: string;
      icon: number;
      notify_login: boolean;
    }>(vipEntriesQuery, [characterId, VIP_LIMITS.maxEntries]);
    return result.rows.map((row) => ({
      vipCharacterId: row.vip_character_id,
      name: row.display_name,
      description: row.description,
      icon: row.icon,
      notifyLogin: row.notify_login,
    }));
  }

  async addVip(input: {
    characterId: string;
    targetName: string;
  }): Promise<AddVipResult> {
    try {
      return await this.transact(async () => {
        return runSerializableTransaction(this.pool, async (client) => {
          const target = await client.query<{
            id: string;
            display_name: string;
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
          if ((count.rows[0]?.total ?? 0) >= VIP_LIMITS.maxEntries) {
            throw this.rollback("list-full");
          }
          await client.query(insertVipQuery, [
            input.characterId,
            targetRow.id,
          ]);
          return {
            status: "added" as const,
            entry: {
              vipCharacterId: targetRow.id,
              name: targetRow.display_name,
              description: "",
              icon: 0,
              notifyLogin: false,
            },
          };
        });
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

  /** Bounded retry on serialization aborts (racing adds settle). */
  private async transact<T>(operation: () => Promise<T>): Promise<T> {
    let lastCause: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await operation();
      } catch (cause) {
        if (!isSerializationFailure(cause)) throw cause;
        lastCause = cause;
      }
    }
    throw lastCause;
  }

  private rollback(
    reason: VipOpFailure["reason"],
  ): TransactionRollback<VipOpFailure> {
    return new TransactionRollback<VipOpFailure>({ status: "failed", reason });
  }
}
