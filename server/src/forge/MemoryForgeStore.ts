import { FORGE_RULES } from "@tibia/protocol";
import type {
  ForgeConversionRequest,
  ForgeExchangeRequest,
  ForgeHistoryPage,
  ForgeHistoryRow,
  ForgeResourcesRecord,
  ForgeStore,
  ForgeTransactionResult,
} from "./ForgeStore";

/**
 * In-memory forge store for unit tests: balances and history behave like the
 * SQL, but item legs are echoed back as empty mutations — item-side
 * conservation is exercised by the Pg integration tests.
 */
export class MemoryForgeStore implements ForgeStore {
  private readonly resources = new Map<string, { dusts: number; dustLevel: number }>();
  private readonly historyRows = new Map<
    string,
    Array<ForgeHistoryRow & { createdAt: number }>
  >();
  readonly exchanges: ForgeExchangeRequest[] = [];
  goldBalances = new Map<string, number>();

  setResources(characterId: string, dusts: number, dustLevel = 100): void {
    this.resources.set(characterId, { dusts, dustLevel });
  }

  async load(characterId: string): Promise<ForgeResourcesRecord> {
    return this.recordOf(characterId);
  }

  async grantDusts(
    characterId: string,
    amount: number,
  ): Promise<ForgeResourcesRecord> {
    const record = this.recordOf(characterId);
    record.dusts = Math.min(record.dustLevel, record.dusts + amount);
    return { ...record };
  }

  async exchange(
    characterId: string,
    request: ForgeExchangeRequest,
  ): Promise<ForgeTransactionResult> {
    const record = this.recordOf(characterId);
    if (record.dusts < request.dustCost) return { status: "insufficient-dust" };
    const gold = this.goldBalances.get(characterId) ?? 0;
    if (gold < request.goldCost) return { status: "insufficient-gold" };
    record.dusts -= request.dustCost;
    this.goldBalances.set(characterId, gold - request.goldCost);
    this.exchanges.push(request);
    this.pushHistory(characterId, request.history);
    return {
      status: "committed",
      resources: { ...record },
      mutation: { after: [] },
    };
  }

  async conversion(
    characterId: string,
    request: ForgeConversionRequest,
  ): Promise<ForgeTransactionResult> {
    const record = this.recordOf(characterId);
    if (request.conversion === "increase-dust-limit") {
      if (record.dustLevel >= FORGE_RULES.maxDustLimit) {
        return { status: "dust-limit-reached" };
      }
      const cost = record.dustLevel - FORGE_RULES.dustLimitCostOffset;
      if (record.dusts < cost) return { status: "insufficient-dust" };
      record.dusts -= cost;
      record.dustLevel += 1;
    } else if (request.conversion === "dust-to-slivers") {
      if (record.dusts < request.history.costDust) {
        return { status: "insufficient-dust" };
      }
      record.dusts -= request.history.costDust;
    }
    this.pushHistory(characterId, request.history);
    return {
      status: "committed",
      resources: { ...record },
      mutation: { after: [] },
    };
  }

  async history(
    characterId: string,
    page: number,
    pageSize: number,
  ): Promise<ForgeHistoryPage> {
    const rows = [...(this.historyRows.get(characterId) ?? [])].reverse();
    return {
      entries: rows.slice(page * pageSize, (page + 1) * pageSize),
      totalEntries: rows.length,
    };
  }

  private pushHistory(characterId: string, history: ForgeHistoryRow): void {
    const rows = this.historyRows.get(characterId) ?? [];
    rows.push({ ...history, createdAt: rows.length + 1 });
    this.historyRows.set(characterId, rows);
  }

  private recordOf(characterId: string): { dusts: number; dustLevel: number } {
    const existing = this.resources.get(characterId);
    if (existing) return existing;
    const fresh = { dusts: 0, dustLevel: FORGE_RULES.initialDustLimit };
    this.resources.set(characterId, fresh);
    return fresh;
  }
}
