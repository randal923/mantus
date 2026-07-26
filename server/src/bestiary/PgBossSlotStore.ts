import type { Pool } from "pg";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import { debitBankBalanceQuery } from "../economy/sql/debitBankBalanceQuery";
import { insertPreyAuditQuery } from "../prey/sql/insertPreyAuditQuery";
import type {
  BossSlotChargeResult,
  BossSlotRecord,
  BossSlotStore,
} from "./BossSlotStore";
import { insertBossSlotLedgerQuery } from "./sql/insertBossSlotLedgerQuery";
import { selectBossSlotsQuery } from "./sql/selectBossSlotsQuery";
import { upsertBossSlotsQuery } from "./sql/upsertBossSlotsQuery";

interface BossSlotRow {
  slot_one_race_id: number | null;
  slot_two_race_id: number | null;
  remove_count: number;
}

export class PgBossSlotStore implements BossSlotStore {
  constructor(private readonly pool: Pool) {}

  async load(characterId: string): Promise<BossSlotRecord | null> {
    const result = await this.pool.query<BossSlotRow>(selectBossSlotsQuery, [
      characterId,
    ]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      slotOneRaceId: row.slot_one_race_id,
      slotTwoRaceId: row.slot_two_race_id,
      removeCount: row.remove_count,
    };
  }

  async save(characterId: string, record: BossSlotRecord): Promise<void> {
    await this.pool.query(upsertBossSlotsQuery, [
      characterId,
      record.slotOneRaceId,
      record.slotTwoRaceId,
      record.removeCount,
    ]);
  }

  async chargeRemove(
    characterId: string,
    priceGold: number,
    record: BossSlotRecord,
  ): Promise<BossSlotChargeResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const debited = await client.query<{ balance: string }>(
        debitBankBalanceQuery,
        [characterId, priceGold],
      );
      if (debited.rowCount === 0) {
        throw new TransactionRollback({ status: "insufficient-gold" });
      }
      const balance = Number(debited.rows[0]?.balance ?? 0);
      await client.query(insertBossSlotLedgerQuery, [
        characterId,
        priceGold,
        balance,
      ]);
      await client.query(upsertBossSlotsQuery, [
        characterId,
        record.slotOneRaceId,
        record.slotTwoRaceId,
        record.removeCount,
      ]);
      await client.query(insertPreyAuditQuery, [
        characterId,
        "boss-slot-remove",
        JSON.stringify({ priceGold, removeCount: record.removeCount }),
      ]);
      return { status: "committed", goldAfter: balance };
    });
  }
}
