import type {
  GemGrades,
  GemQuality,
  GemResources,
  RevealedGem,
  WheelDomain,
} from "@tibia/protocol";

/** Unrevealed gem + fragment balances (no gold; that lives in the bank). */
export type GemResourceBalances = Omit<GemResources, "gold">;

export interface GemCharacterData {
  readonly resources: GemResourceBalances;
  readonly revealed: ReadonlyArray<RevealedGem>;
  readonly equipped: Partial<Readonly<Record<WheelDomain, string>>>;
  readonly grades: GemGrades;
}

export type GemTransactionFailure =
  | "insufficient-gold"
  | "insufficient-gems"
  | "insufficient-fragments"
  | "gem-limit-reached"
  | "gem-not-found"
  | "max-grade";

export type GemTransactionResult =
  | { readonly status: "committed"; readonly goldAfter?: number }
  | { readonly status: GemTransactionFailure };

/**
 * Durable gem atelier storage. Every method that spends gold, gems, or
 * fragments performs the debit and the gem mutation in one ACID
 * transaction with the audit/ledger rows (charter rules 2 and 11); the
 * caller's prechecks are advisory only.
 */
export interface GemStore {
  load(characterId: string): Promise<GemCharacterData>;
  bankBalance(characterId: string): Promise<number>;
  reveal(
    characterId: string,
    quality: GemQuality,
    gem: RevealedGem,
    goldCost: number,
  ): Promise<GemTransactionResult>;
  destroy(
    characterId: string,
    gemId: string,
    fragment: "lesser" | "greater",
    amount: number,
  ): Promise<GemTransactionResult>;
  switchDomain(
    characterId: string,
    gemId: string,
    domain: WheelDomain,
    goldCost: number,
  ): Promise<GemTransactionResult>;
  improveGrade(
    characterId: string,
    modKind: "basic" | "supreme",
    modId: number,
    nextGrade: number,
    goldCost: number,
    fragmentCost: number,
  ): Promise<GemTransactionResult>;
  setLocked(characterId: string, gemId: string, locked: boolean): Promise<void>;
  /** Atomically makes `gemId` (or nobody, when null) the domain's equipped gem. */
  setEquipped(
    characterId: string,
    domain: WheelDomain,
    gemId: string | null,
  ): Promise<void>;
  /** Kill-drop credit; write-behind, loot-like (no audit row). */
  creditGemDrops(
    characterId: string,
    deltas: Partial<
      Record<"lesserGems" | "regularGems" | "greaterGems", number>
    >,
  ): Promise<void>;
}
