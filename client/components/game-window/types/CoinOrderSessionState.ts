import type {
  CoinOrder,
  CoinOrderFailedReason,
  CoinPackage,
} from "@tibia/protocol";

export interface CoinOrderSessionState {
  readonly packages: ReadonlyArray<CoinPackage>;
  readonly order: CoinOrder | null;
  readonly pending: boolean;
  readonly completed: {
    readonly orderId: string;
    readonly coins: number;
  } | null;
  readonly error: CoinOrderFailedReason | null;
}
