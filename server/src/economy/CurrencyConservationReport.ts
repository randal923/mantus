/** One account whose balance disagrees with its ledger's running total. */
export interface BankLedgerDrift {
  readonly characterId: string;
  readonly balance: number;
  readonly ledgerBalance: number;
}

/** One ledger row whose balance step does not match the amount it records. */
export interface BankLedgerBreak {
  readonly entryId: string;
  readonly characterId: string;
  readonly entryType: string;
  readonly amount: number;
  readonly balanceBefore: number;
  readonly balanceAfter: number;
}

/** One coin row that exists with no audit trail behind it. */
export interface OrphanCoinRow {
  readonly itemId: string;
  readonly itemTypeId: number;
  readonly count: number;
}

/** Result of one read-only conservation sweep. */
export interface CurrencyConservationReport {
  readonly observedAt: Date;
  /** Money supply, in gold worth. */
  readonly coins: number;
  readonly bank: number;
  /** Money committed to open buy offers; DB-constrained to remaining × price. */
  readonly escrow: number;
  readonly total: number;
  /** Coin worth the audit log says was minted/burned since the last sweep. */
  readonly minted: number;
  readonly burned: number;
  /**
   * `Δcoins - (minted - burned)`. Zero means every coin that appeared or
   * vanished was audited — including the coin legs of deposits and
   * withdrawals, which burn and mint coins as money moves to and from the
   * bank. Null on the first sweep, which only establishes the baseline.
   */
  readonly unexplainedCoinDelta: number | null;
  readonly bankLedgerDrift: ReadonlyArray<BankLedgerDrift>;
  readonly bankLedgerBreaks: ReadonlyArray<BankLedgerBreak>;
  readonly orphanCoinRows: ReadonlyArray<OrphanCoinRow>;
  /** True when nothing needs an operator's attention. */
  readonly balanced: boolean;
}
