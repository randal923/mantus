import type { Pool, PoolClient } from "pg";
import { TASK_HUNTING_STATES } from "@tibia/protocol";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import { debitBankBalanceQuery } from "../economy/sql/debitBankBalanceQuery";
import { debitWildcardsQuery } from "../prey/sql/debitWildcardsQuery";
import { insertPreyAuditQuery } from "../prey/sql/insertPreyAuditQuery";
import { insertPreyResourcesRowQuery } from "../prey/sql/insertPreyResourcesRowQuery";
import { selectPreyResourcesQuery } from "../prey/sql/selectPreyResourcesQuery";
import type {
  HuntingTaskStore,
  TaskChargeResult,
  TaskClaimResult,
  TaskSlotRecord,
  TaskSnapshot,
  TaskWildcardSpendResult,
} from "./HuntingTaskStore";
import { claimTaskSlotQuery } from "./sql/claimTaskSlotQuery";
import { creditTaskPointsQuery } from "./sql/creditTaskPointsQuery";
import { insertTaskLedgerQuery } from "./sql/insertTaskLedgerQuery";
import { selectTaskSlotsQuery } from "./sql/selectTaskSlotsQuery";
import { upsertTaskSlotQuery } from "./sql/upsertTaskSlotQuery";

interface TaskSlotRow {
  slot: number;
  state: string;
  grid: number[];
  selected_race_id: number | null;
  upgrade: boolean;
  rarity: number;
  kills: number;
  disabled_until: string;
  free_reroll_at: string;
}

export class PgHuntingTaskStore implements HuntingTaskStore {
  constructor(private readonly pool: Pool) {}

  async load(characterId: string): Promise<TaskSnapshot | null> {
    const slots = await this.pool.query<TaskSlotRow>(selectTaskSlotsQuery, [
      characterId,
    ]);
    if (slots.rowCount === 0) return null;
    // Read-only, same reasoning as PgPreyStore.load: slots existing means
    // `initialize` seeded the shared resources row, a missing row reads as the
    // schema's zeros below, and the task-point credit path seeds it too.
    const resources = await this.pool.query<{
      wildcards: string;
      task_points: string;
    }>(selectPreyResourcesQuery, [characterId]);
    return {
      slots: slots.rows.map((row) => this.parseRow(row)),
      taskPoints: Number(resources.rows[0]?.task_points ?? 0),
      wildcards: Number(resources.rows[0]?.wildcards ?? 0),
    };
  }

  async initialize(
    characterId: string,
    slots: ReadonlyArray<TaskSlotRecord>,
  ): Promise<void> {
    await runSerializableTransaction(this.pool, async (client) => {
      await client.query(insertPreyResourcesRowQuery, [characterId]);
      for (const record of slots) {
        await this.upsert(client, characterId, record);
      }
    });
  }

  async saveSlot(characterId: string, record: TaskSlotRecord): Promise<void> {
    await this.pool.query(
      upsertTaskSlotQuery,
      this.upsertParams(characterId, record),
    );
  }

  async chargeGold(
    characterId: string,
    priceGold: number,
    record: TaskSlotRecord,
    kind: "reroll" | "cancel",
  ): Promise<TaskChargeResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const debited = await client.query<{ balance: string }>(
        debitBankBalanceQuery,
        [characterId, priceGold],
      );
      if (debited.rowCount === 0) {
        throw new TransactionRollback({ status: "insufficient-gold" });
      }
      const balance = Number(debited.rows[0]?.balance ?? 0);
      const entryType =
        kind === "reroll" ? "hunting-task-reroll" : "hunting-task-cancel";
      await client.query(insertTaskLedgerQuery, [
        characterId,
        entryType,
        priceGold,
        balance,
      ]);
      await this.upsert(client, characterId, record);
      await client.query(insertPreyAuditQuery, [
        characterId,
        entryType,
        JSON.stringify({ slot: record.slot, priceGold }),
      ]);
      return { status: "committed", goldAfter: balance };
    });
  }

  async spendWildcards(
    characterId: string,
    cost: number,
    event: "hunting-task-star-reroll" | "hunting-task-wildcard-list",
    record: TaskSlotRecord,
  ): Promise<TaskWildcardSpendResult> {
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

  async claimTask(
    characterId: string,
    expected: { slot: number; raceId: number; minKills: number },
    points: number,
    record: TaskSlotRecord,
  ): Promise<TaskClaimResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const claimed = await client.query(claimTaskSlotQuery, [
        characterId,
        expected.slot,
        expected.raceId,
        expected.minKills,
        record.state,
        [...record.grid],
        record.rarity,
        record.disabledUntilMs,
        record.freeRerollAtMs,
      ]);
      if (claimed.rowCount === 0) {
        throw new TransactionRollback({ status: "not-claimable" });
      }
      await client.query(insertPreyResourcesRowQuery, [characterId]);
      const credited = await client.query<{ task_points: string }>(
        creditTaskPointsQuery,
        [characterId, points],
      );
      await client.query(insertPreyAuditQuery, [
        characterId,
        "hunting-task-claim",
        JSON.stringify({
          slot: expected.slot,
          raceId: expected.raceId,
          minKills: expected.minKills,
          points,
        }),
      ]);
      return {
        status: "committed",
        taskPointsAfter: Number(credited.rows[0]?.task_points ?? 0),
      };
    });
  }

  private async upsert(
    client: PoolClient,
    characterId: string,
    record: TaskSlotRecord,
  ): Promise<void> {
    await client.query(
      upsertTaskSlotQuery,
      this.upsertParams(characterId, record),
    );
  }

  private upsertParams(
    characterId: string,
    record: TaskSlotRecord,
  ): unknown[] {
    return [
      characterId,
      record.slot,
      record.state,
      [...record.grid],
      record.selectedRaceId,
      record.upgrade,
      record.rarity,
      record.kills,
      record.disabledUntilMs,
      record.freeRerollAtMs,
    ];
  }

  private parseRow(row: TaskSlotRow): TaskSlotRecord {
    return {
      slot: row.slot,
      state: (TASK_HUNTING_STATES as ReadonlyArray<string>).includes(row.state)
        ? (row.state as TaskSlotRecord["state"])
        : "selection",
      grid: Array.isArray(row.grid) ? row.grid.map(Number) : [],
      selectedRaceId: row.selected_race_id,
      upgrade: row.upgrade,
      rarity: row.rarity,
      kills: row.kills,
      disabledUntilMs: Number(row.disabled_until),
      freeRerollAtMs: Number(row.free_reroll_at),
    };
  }
}
