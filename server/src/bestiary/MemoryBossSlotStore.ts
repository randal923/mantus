import type {
  BossSlotChargeResult,
  BossSlotRecord,
  BossSlotStore,
} from "./BossSlotStore";

export class MemoryBossSlotStore implements BossSlotStore {
  private readonly rows = new Map<string, BossSlotRecord>();
  private readonly balances = new Map<string, number>();

  setBalance(characterId: string, gold: number): void {
    this.balances.set(characterId, gold);
  }

  balanceOf(characterId: string): number {
    return this.balances.get(characterId) ?? 0;
  }

  async load(characterId: string): Promise<BossSlotRecord | null> {
    return this.rows.get(characterId) ?? null;
  }

  async save(characterId: string, record: BossSlotRecord): Promise<void> {
    this.rows.set(characterId, record);
  }

  async chargeRemove(
    characterId: string,
    priceGold: number,
    record: BossSlotRecord,
  ): Promise<BossSlotChargeResult> {
    const balance = this.balances.get(characterId) ?? 0;
    if (balance < priceGold) return { status: "insufficient-gold" };
    this.balances.set(characterId, balance - priceGold);
    this.rows.set(characterId, record);
    return { status: "committed", goldAfter: balance - priceGold };
  }
}
