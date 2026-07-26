import type { PreyBonusType, PreyOption, PreySlotState } from "@tibia/protocol";

/** Durable copy of one prey slot; timestamps are server-clock epoch ms. */
export interface PreySlotRecord {
  readonly slot: number;
  readonly state: PreySlotState;
  readonly grid: ReadonlyArray<number>;
  readonly selectedRaceId: number | null;
  /** Null until the slot's first activation ever. */
  readonly bonusType: PreyBonusType | null;
  readonly bonusRarity: number;
  readonly bonusPercentage: number;
  readonly bonusTimeLeftSeconds: number;
  readonly freeRerollAtMs: number;
  readonly option: PreyOption;
}

export interface PreySnapshot {
  readonly slots: ReadonlyArray<PreySlotRecord>;
  readonly wildcards: number;
}

export type PreyChargeResult =
  | { readonly status: "committed"; readonly goldAfter: number }
  | { readonly status: "insufficient-gold" };

export type WildcardSpendResult =
  | { readonly status: "committed"; readonly wildcardsAfter: number }
  | { readonly status: "insufficient-wildcards" };

export type PreyWildcardEvent =
  | "prey-bonus-reroll"
  | "prey-wildcard-list"
  | "prey-option-charge";

/**
 * Durable prey state. Gold and wildcard spends happen inside the store in
 * one ACID transaction with the ledger/audit rows and the slot mutation they
 * pay for (charter rules 2 and 11); the service's balance checks are
 * advisory only.
 */
export interface PreyStore {
  /** Null when the character has never been initialized. */
  load(characterId: string): Promise<PreySnapshot | null>;
  initialize(
    characterId: string,
    slots: ReadonlyArray<PreySlotRecord>,
  ): Promise<void>;
  /** Write-behind upsert for non-economy slot changes. */
  saveSlot(characterId: string, record: PreySlotRecord): Promise<void>;
  /** Paid list reroll: conditional bank debit + ledger + audit + slot row. */
  chargeListReroll(
    characterId: string,
    priceGold: number,
    record: PreySlotRecord,
  ): Promise<PreyChargeResult>;
  /** Wildcard spend atomic with the slot mutation it pays for. */
  spendWildcards(
    characterId: string,
    cost: number,
    event: PreyWildcardEvent,
    record: PreySlotRecord,
  ): Promise<WildcardSpendResult>;
  /** Capped grant for store/daily-reward integrations; audited. */
  grantWildcards(
    characterId: string,
    amount: number,
    cap: number,
  ): Promise<{ wildcardsAfter: number }>;
}
