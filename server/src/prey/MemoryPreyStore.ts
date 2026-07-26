import type {
  PreyChargeResult,
  PreySlotRecord,
  PreySnapshot,
  PreyStore,
  PreyWildcardEvent,
  WildcardSpendResult,
} from "./PreyStore";

/**
 * In-memory PreyStore mirroring the Pg store's semantics: spends are
 * conditional on the balance and atomic with the slot write, so racing
 * spends see exactly one winner.
 */
export class MemoryPreyStore implements PreyStore {
  private readonly slots = new Map<string, Map<number, PreySlotRecord>>();
  private readonly wildcards = new Map<string, number>();
  private readonly gold = new Map<string, number>();
  readonly auditEvents: Array<{
    characterId: string;
    event: string;
    details: Record<string, unknown>;
  }> = [];

  setGold(characterId: string, amount: number): void {
    this.gold.set(characterId, amount);
  }

  goldOf(characterId: string): number {
    return this.gold.get(characterId) ?? 0;
  }

  setWildcards(characterId: string, amount: number): void {
    this.wildcards.set(characterId, amount);
  }

  slotRecord(characterId: string, slot: number): PreySlotRecord | undefined {
    return this.slots.get(characterId)?.get(slot);
  }

  async load(characterId: string): Promise<PreySnapshot | null> {
    const rows = this.slots.get(characterId);
    if (!rows || rows.size === 0) return null;
    return {
      slots: [...rows.values()].sort((a, b) => a.slot - b.slot),
      wildcards: this.wildcards.get(characterId) ?? 0,
    };
  }

  async initialize(
    characterId: string,
    slots: ReadonlyArray<PreySlotRecord>,
  ): Promise<void> {
    const rows = this.slots.get(characterId) ?? new Map<number, PreySlotRecord>();
    for (const record of slots) rows.set(record.slot, { ...record });
    this.slots.set(characterId, rows);
    if (!this.wildcards.has(characterId)) this.wildcards.set(characterId, 0);
  }

  async saveSlot(characterId: string, record: PreySlotRecord): Promise<void> {
    const rows = this.slots.get(characterId) ?? new Map<number, PreySlotRecord>();
    rows.set(record.slot, { ...record });
    this.slots.set(characterId, rows);
  }

  async chargeListReroll(
    characterId: string,
    priceGold: number,
    record: PreySlotRecord,
  ): Promise<PreyChargeResult> {
    const balance = this.gold.get(characterId) ?? 0;
    if (balance < priceGold) return { status: "insufficient-gold" };
    this.gold.set(characterId, balance - priceGold);
    await this.saveSlot(characterId, record);
    this.auditEvents.push({
      characterId,
      event: "prey-list-reroll",
      details: { slot: record.slot, priceGold },
    });
    return { status: "committed", goldAfter: balance - priceGold };
  }

  async spendWildcards(
    characterId: string,
    cost: number,
    event: PreyWildcardEvent,
    record: PreySlotRecord,
  ): Promise<WildcardSpendResult> {
    const balance = this.wildcards.get(characterId) ?? 0;
    if (balance < cost) return { status: "insufficient-wildcards" };
    this.wildcards.set(characterId, balance - cost);
    await this.saveSlot(characterId, record);
    this.auditEvents.push({
      characterId,
      event,
      details: { slot: record.slot, cost },
    });
    return { status: "committed", wildcardsAfter: balance - cost };
  }

  async grantWildcards(
    characterId: string,
    amount: number,
    cap: number,
  ): Promise<{ wildcardsAfter: number }> {
    const balance = this.wildcards.get(characterId) ?? 0;
    const after = Math.min(cap, balance + amount);
    this.wildcards.set(characterId, after);
    this.auditEvents.push({
      characterId,
      event: "prey-wildcard-grant",
      details: { amount, after },
    });
    return { wildcardsAfter: after };
  }
}
