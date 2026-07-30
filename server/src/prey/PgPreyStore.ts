import type { Pool, PoolClient } from "pg";
import { PREY_BONUS_TYPES, PREY_OPTIONS, PREY_SLOT_STATES } from "@tibia/protocol";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import { debitBankBalanceQuery } from "../economy/sql/debitBankBalanceQuery";
import type {
  PreyChargeResult,
  PreySlotRecord,
  PreySnapshot,
  PreyStore,
  PreyWildcardEvent,
  WildcardSpendResult,
} from "./PreyStore";
import { debitWildcardsQuery } from "./sql/debitWildcardsQuery";
import { grantWildcardsQuery } from "./sql/grantWildcardsQuery";
import { insertPreyAuditQuery } from "./sql/insertPreyAuditQuery";
import { insertPreyLedgerQuery } from "./sql/insertPreyLedgerQuery";
import { insertPreyResourcesRowQuery } from "./sql/insertPreyResourcesRowQuery";
import { selectPreyResourcesQuery } from "./sql/selectPreyResourcesQuery";
import { selectPreySlotsQuery } from "./sql/selectPreySlotsQuery";
import { upsertPreySlotQuery } from "./sql/upsertPreySlotQuery";

interface PreySlotRow {
  slot: number;
  state: string;
  grid: number[];
  selected_race_id: number | null;
  bonus_type: string | null;
  bonus_rarity: number;
  bonus_percentage: number;
  bonus_time_left: number;
  free_reroll_at: string;
  reroll_option: string;
}

export class PgPreyStore implements PreyStore {
  constructor(private readonly pool: Pool) {}

  async load(characterId: string): Promise<PreySnapshot | null> {
    const slots = await this.pool.query<PreySlotRow>(selectPreySlotsQuery, [
      characterId,
    ]);
    if (slots.rowCount === 0) return null;
    // Read-only: slots existing means `initialize` already seeded the
    // resources row, a missing row reads as the schema's zero below, and
    // `grantWildcards` seeds it while `spendWildcards` is a guarded debit that
    // correctly matches nothing without it. Login pays no write for this.
    const resources = await this.pool.query<{ wildcards: string }>(
      selectPreyResourcesQuery,
      [characterId],
    );
    return {
      slots: slots.rows.map((row) => this.parseRow(row)),
      wildcards: Number(resources.rows[0]?.wildcards ?? 0),
    };
  }

  async initialize(
    characterId: string,
    slots: ReadonlyArray<PreySlotRecord>,
  ): Promise<void> {
    await runSerializableTransaction(this.pool, async (client) => {
      await client.query(insertPreyResourcesRowQuery, [characterId]);
      for (const record of slots) {
        await this.upsert(client, characterId, record);
      }
    });
  }

  async saveSlot(characterId: string, record: PreySlotRecord): Promise<void> {
    await this.pool.query(
      upsertPreySlotQuery,
      this.upsertParams(characterId, record),
    );
  }

  async chargeListReroll(
    characterId: string,
    priceGold: number,
    record: PreySlotRecord,
  ): Promise<PreyChargeResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const debited = await client.query<{ balance: string }>(
        debitBankBalanceQuery,
        [characterId, priceGold],
      );
      if (debited.rowCount === 0) {
        throw new TransactionRollback({ status: "insufficient-gold" });
      }
      const balance = Number(debited.rows[0]?.balance ?? 0);
      await client.query(insertPreyLedgerQuery, [
        characterId,
        priceGold,
        balance,
      ]);
      await this.upsert(client, characterId, record);
      await client.query(insertPreyAuditQuery, [
        characterId,
        "prey-list-reroll",
        JSON.stringify({ slot: record.slot, priceGold }),
      ]);
      return { status: "committed", goldAfter: balance };
    });
  }

  async spendWildcards(
    characterId: string,
    cost: number,
    event: PreyWildcardEvent,
    record: PreySlotRecord,
  ): Promise<WildcardSpendResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const debited = await client.query<{ wildcards: string }>(
        debitWildcardsQuery,
        [characterId, cost],
      );
      if (debited.rowCount === 0) {
        throw new TransactionRollback({ status: "insufficient-wildcards" });
      }
      await this.upsert(client, characterId, record);
      await client.query(insertPreyAuditQuery, [
        characterId,
        event,
        JSON.stringify({ slot: record.slot, cost }),
      ]);
      return {
        status: "committed",
        wildcardsAfter: Number(debited.rows[0]?.wildcards ?? 0),
      };
    });
  }

  async grantWildcards(
    characterId: string,
    amount: number,
    cap: number,
  ): Promise<{ wildcardsAfter: number }> {
    return runSerializableTransaction(this.pool, async (client) => {
      await client.query(insertPreyResourcesRowQuery, [characterId]);
      const granted = await client.query<{ wildcards: string }>(
        grantWildcardsQuery,
        [characterId, amount, cap],
      );
      const after = Number(granted.rows[0]?.wildcards ?? 0);
      await client.query(insertPreyAuditQuery, [
        characterId,
        "prey-wildcard-grant",
        JSON.stringify({ amount, after }),
      ]);
      return { wildcardsAfter: after };
    });
  }

  private async upsert(
    client: PoolClient,
    characterId: string,
    record: PreySlotRecord,
  ): Promise<void> {
    await client.query(
      upsertPreySlotQuery,
      this.upsertParams(characterId, record),
    );
  }

  private upsertParams(
    characterId: string,
    record: PreySlotRecord,
  ): unknown[] {
    return [
      characterId,
      record.slot,
      record.state,
      [...record.grid],
      record.selectedRaceId,
      record.bonusType,
      record.bonusRarity,
      record.bonusPercentage,
      record.bonusTimeLeftSeconds,
      record.freeRerollAtMs,
      record.option,
    ];
  }

  private parseRow(row: PreySlotRow): PreySlotRecord {
    return {
      slot: row.slot,
      state: parseEnum(row.state, PREY_SLOT_STATES, "selection"),
      grid: Array.isArray(row.grid) ? row.grid.map(Number) : [],
      selectedRaceId: row.selected_race_id,
      bonusType:
        row.bonus_type === null
          ? null
          : parseEnum(row.bonus_type, PREY_BONUS_TYPES, "damage"),
      bonusRarity: row.bonus_rarity,
      bonusPercentage: row.bonus_percentage,
      bonusTimeLeftSeconds: row.bonus_time_left,
      freeRerollAtMs: Number(row.free_reroll_at),
      option: parseEnum(row.reroll_option, PREY_OPTIONS, "none"),
    };
  }
}

function parseEnum<TValue extends string>(
  value: string,
  values: ReadonlyArray<TValue>,
  fallback: TValue,
): TValue {
  return (values as ReadonlyArray<string>).includes(value)
    ? (value as TValue)
    : fallback;
}
