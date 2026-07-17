/**
 * Carried coin counts per denomination. Gold (type 3031) is worth 1,
 * platinum (3035) is worth 100, crystal (3043) is worth 10,000 — the
 * single canonical conversion path for all economy code.
 */
export interface CurrencyBalance {
  readonly gold: number;
  readonly platinum: number;
  readonly crystal: number;
}

export const GOLD_COIN_TYPE_ID = 3031;
export const PLATINUM_COIN_TYPE_ID = 3035;
export const CRYSTAL_COIN_TYPE_ID = 3043;

export const PLATINUM_WORTH = 100;
export const CRYSTAL_WORTH = 10_000;
