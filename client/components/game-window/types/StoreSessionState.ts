import type {
  StoreActionFailedReason,
  StoreCategory,
} from "@tibia/protocol";

export interface StoreSessionState {
  readonly categories: ReadonlyArray<StoreCategory>;
  readonly pending: boolean;
  readonly pendingOfferId: string | null;
  readonly purchasedOfferId: string | null;
  readonly error: StoreActionFailedReason | null;
}
