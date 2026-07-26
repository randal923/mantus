export interface BossSlotRecord {
  readonly slotOneRaceId: number | null;
  readonly slotTwoRaceId: number | null;
  readonly removeCount: number;
}

export type BossSlotChargeResult =
  | { readonly status: "committed"; readonly goldAfter: number }
  | { readonly status: "insufficient-gold" };

/**
 * Durable bosstiary boss slots. Free mutations persist write-behind; a paid
 * removal is one ACID transaction with the bank debit, ledger, and audit
 * rows (charter rules 2/11).
 */
export interface BossSlotStore {
  load(characterId: string): Promise<BossSlotRecord | null>;
  save(characterId: string, record: BossSlotRecord): Promise<void>;
  chargeRemove(
    characterId: string,
    priceGold: number,
    record: BossSlotRecord,
  ): Promise<BossSlotChargeResult>;
}
