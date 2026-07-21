import type { Pool, PoolClient } from "pg";
import {
  GEM_ATELIER_LIMITS,
  GEM_QUALITIES,
  WHEEL_DOMAINS,
  type GemQuality,
  type RevealedGem,
  type WheelDomain,
} from "@tibia/protocol";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import { debitBankBalanceQuery } from "../economy/sql/debitBankBalanceQuery";
import { selectBankBalanceQuery } from "../economy/sql/selectBankBalanceQuery";
import type {
  GemCharacterData,
  GemStore,
  GemTransactionResult,
} from "./GemStore";
import { adjustFragmentsQuery } from "./sql/adjustFragmentsQuery";
import { countRevealedGemsQuery } from "./sql/countRevealedGemsQuery";
import { decrementUnrevealedGemQuery } from "./sql/decrementUnrevealedGemQuery";
import { deleteGemRowQuery } from "./sql/deleteGemRowQuery";
import { insertGemAuditQuery } from "./sql/insertGemAuditQuery";
import { insertGemGradeQuery } from "./sql/insertGemGradeQuery";
import { insertGemLedgerQuery } from "./sql/insertGemLedgerQuery";
import { insertGemResourcesRowQuery } from "./sql/insertGemResourcesRowQuery";
import { insertGemRowQuery } from "./sql/insertGemRowQuery";
import { selectGemGradesQuery } from "./sql/selectGemGradesQuery";
import { selectGemResourcesQuery } from "./sql/selectGemResourcesQuery";
import { selectGemRowsQuery } from "./sql/selectGemRowsQuery";
import { clearGemEquippedQuery } from "./sql/clearGemEquippedQuery";
import { setGemEquippedQuery } from "./sql/setGemEquippedQuery";
import { updateGemDomainQuery } from "./sql/updateGemDomainQuery";
import { updateGemGradeQuery } from "./sql/updateGemGradeQuery";
import { updateGemLockQuery } from "./sql/updateGemLockQuery";
import { upsertGemDropsQuery } from "./sql/upsertGemDropsQuery";

const domainIndex = (domain: WheelDomain): number =>
  WHEEL_DOMAINS.indexOf(domain);

const qualityIndex = (quality: GemQuality): number =>
  GEM_QUALITIES.indexOf(quality);

const fragmentIndex = (fragment: "lesser" | "greater"): number =>
  fragment === "lesser" ? 0 : 1;

interface GemRow {
  id: string;
  domain: number;
  quality: number;
  basic_mod_1: number;
  basic_mod_2: number | null;
  supreme_mod: number | null;
  locked: boolean;
  equipped: boolean;
}

export class PgGemStore implements GemStore {
  constructor(private readonly pool: Pool) {}

  async load(characterId: string): Promise<GemCharacterData> {
    await this.pool.query(insertGemResourcesRowQuery, [characterId]);
    const [resources, gems, grades] = await Promise.all([
      this.pool.query<{
        lesser_gems: number;
        regular_gems: number;
        greater_gems: number;
        lesser_fragments: number;
        greater_fragments: number;
      }>(selectGemResourcesQuery, [characterId]),
      this.pool.query<GemRow>(selectGemRowsQuery, [characterId]),
      this.pool.query<{ mod_kind: number; mod_id: number; grade: number }>(
        selectGemGradesQuery,
        [characterId],
      ),
    ]);
    const balances = resources.rows[0];
    const revealed: RevealedGem[] = [];
    const equipped: Partial<Record<WheelDomain, string>> = {};
    for (const row of gems.rows) {
      const domain = WHEEL_DOMAINS[row.domain];
      const quality = GEM_QUALITIES[row.quality];
      if (!domain || !quality) continue;
      const gem: RevealedGem = {
        id: row.id,
        domain,
        quality,
        locked: row.locked,
        basicModIds:
          row.basic_mod_2 === null
            ? [row.basic_mod_1]
            : [row.basic_mod_1, row.basic_mod_2],
        ...(row.supreme_mod === null ? {} : { supremeModId: row.supreme_mod }),
      };
      revealed.push(gem);
      if (row.equipped) equipped[domain] = row.id;
    }
    return {
      resources: {
        lesserGems: balances?.lesser_gems ?? 0,
        regularGems: balances?.regular_gems ?? 0,
        greaterGems: balances?.greater_gems ?? 0,
        lesserFragments: balances?.lesser_fragments ?? 0,
        greaterFragments: balances?.greater_fragments ?? 0,
      },
      revealed,
      equipped,
      grades: {
        basic: grades.rows
          .filter((row) => row.mod_kind === 0)
          .map((row) => ({ modId: row.mod_id, grade: row.grade })),
        supreme: grades.rows
          .filter((row) => row.mod_kind === 1)
          .map((row) => ({ modId: row.mod_id, grade: row.grade })),
      },
    };
  }

  async bankBalance(characterId: string): Promise<number> {
    const result = await this.pool.query<{ balance: string }>(
      selectBankBalanceQuery,
      [characterId],
    );
    return Number(result.rows[0]?.balance ?? 0);
  }

  async reveal(
    characterId: string,
    quality: GemQuality,
    gem: RevealedGem,
    goldCost: number,
  ): Promise<GemTransactionResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const taken = await client.query(decrementUnrevealedGemQuery, [
        characterId,
        qualityIndex(quality),
      ]);
      if (taken.rowCount === 0) {
        throw new TransactionRollback({ status: "insufficient-gems" });
      }
      const count = await client.query<{ count: number }>(
        countRevealedGemsQuery,
        [characterId],
      );
      if ((count.rows[0]?.count ?? 0) >= GEM_ATELIER_LIMITS.maxRevealedGems) {
        throw new TransactionRollback({ status: "gem-limit-reached" });
      }
      const balance = await this.debit(client, characterId, goldCost);
      await client.query(insertGemRowQuery, [
        gem.id,
        characterId,
        domainIndex(gem.domain),
        qualityIndex(gem.quality),
        gem.basicModIds[0],
        gem.basicModIds[1] ?? null,
        gem.supremeModId ?? null,
      ]);
      await this.audit(client, characterId, "gem-reveal", {
        gemId: gem.id,
        quality: gem.quality,
        domain: gem.domain,
        goldCost,
      });
      return { status: "committed", goldAfter: balance };
    });
  }

  async destroy(
    characterId: string,
    gemId: string,
    fragment: "lesser" | "greater",
    amount: number,
  ): Promise<GemTransactionResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const deleted = await client.query(deleteGemRowQuery, [
        characterId,
        gemId,
      ]);
      if (deleted.rowCount === 0) {
        throw new TransactionRollback({ status: "gem-not-found" });
      }
      const credited = await client.query(adjustFragmentsQuery, [
        characterId,
        fragmentIndex(fragment),
        amount,
      ]);
      if (credited.rowCount === 0) {
        throw new TransactionRollback({ status: "gem-not-found" });
      }
      await this.audit(client, characterId, "gem-destroy", {
        gemId,
        fragment,
        amount,
      });
      return { status: "committed" };
    });
  }

  async switchDomain(
    characterId: string,
    gemId: string,
    domain: WheelDomain,
    goldCost: number,
  ): Promise<GemTransactionResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const updated = await client.query(updateGemDomainQuery, [
        characterId,
        gemId,
        domainIndex(domain),
      ]);
      if (updated.rowCount === 0) {
        throw new TransactionRollback({ status: "gem-not-found" });
      }
      const balance = await this.debit(client, characterId, goldCost);
      await this.audit(client, characterId, "gem-switch-domain", {
        gemId,
        domain,
        goldCost,
      });
      return { status: "committed", goldAfter: balance };
    });
  }

  async improveGrade(
    characterId: string,
    modKind: "basic" | "supreme",
    modId: number,
    nextGrade: number,
    goldCost: number,
    fragmentCost: number,
  ): Promise<GemTransactionResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const kind = modKind === "basic" ? 0 : 1;
      const graded =
        nextGrade === 1
          ? await client.query(insertGemGradeQuery, [characterId, kind, modId])
          : await client.query(updateGemGradeQuery, [
              characterId,
              kind,
              modId,
              nextGrade,
            ]);
      if (graded.rowCount === 0) {
        throw new TransactionRollback({ status: "max-grade" });
      }
      const spent = await client.query(adjustFragmentsQuery, [
        characterId,
        kind,
        -fragmentCost,
      ]);
      if (spent.rowCount === 0) {
        throw new TransactionRollback({ status: "insufficient-fragments" });
      }
      const balance = await this.debit(client, characterId, goldCost);
      await this.audit(client, characterId, "gem-grade-improve", {
        modKind,
        modId,
        grade: nextGrade,
        goldCost,
        fragmentCost,
      });
      return { status: "committed", goldAfter: balance };
    });
  }

  async setLocked(
    characterId: string,
    gemId: string,
    locked: boolean,
  ): Promise<void> {
    await this.pool.query(updateGemLockQuery, [characterId, gemId, locked]);
  }

  async setEquipped(
    characterId: string,
    domain: WheelDomain,
    gemId: string | null,
  ): Promise<void> {
    await runSerializableTransaction(this.pool, async (client) => {
      await client.query(clearGemEquippedQuery, [
        characterId,
        domainIndex(domain),
      ]);
      if (gemId !== null) {
        await client.query(setGemEquippedQuery, [
          characterId,
          domainIndex(domain),
          gemId,
        ]);
      }
    });
  }

  async creditGemDrops(
    characterId: string,
    deltas: Partial<
      Record<"lesserGems" | "regularGems" | "greaterGems", number>
    >,
  ): Promise<void> {
    await this.pool.query(upsertGemDropsQuery, [
      characterId,
      deltas.lesserGems ?? 0,
      deltas.regularGems ?? 0,
      deltas.greaterGems ?? 0,
    ]);
  }

  private async debit(
    client: PoolClient,
    characterId: string,
    goldCost: number,
  ): Promise<number> {
    const debited = await client.query<{ balance: string }>(
      debitBankBalanceQuery,
      [characterId, goldCost],
    );
    if (debited.rowCount === 0) {
      throw new TransactionRollback({ status: "insufficient-gold" });
    }
    const balance = Number(debited.rows[0]?.balance ?? 0);
    await client.query(insertGemLedgerQuery, [characterId, goldCost, balance]);
    return balance;
  }

  private async audit(
    client: PoolClient,
    characterId: string,
    eventType: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await client.query(insertGemAuditQuery, [
      characterId,
      eventType,
      JSON.stringify(details),
    ]);
  }
}
