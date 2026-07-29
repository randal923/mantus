import type { PoolClient } from "pg";
import type { ItemCatalog } from "../../item/ItemCatalog";

/** The buyer's character row, locked by the purchase transaction. */
export interface StoreCharacterRow {
  readonly id: string;
  readonly display_name: string;
  /** Canary PlayerSex_t: 0 = female, 1 = male. */
  readonly sex: number;
  readonly outfit_look_type: number;
  readonly outfit_addons: number;
  readonly town_id: number;
}

/**
 * Everything a delivery leg may touch, all of it inside the one SERIALIZABLE
 * transaction that also debits the coins. A leg that cannot complete throws
 * `TransactionRollback`, which takes the debit down with it — there is no
 * such thing as a half-delivered purchase (charter rule 2).
 */
export interface StoreDeliveryContext {
  readonly client: PoolClient;
  readonly characterId: string;
  readonly accountId: string;
  readonly character: StoreCharacterRow;
  readonly catalog: ItemCatalog;
  /** Idempotency anchor shared by the coin debit and every delivery row. */
  readonly requestKey: string;
  /** The transaction's own clock; never a value from the caller. */
  readonly transactionNow: Date;
  /** Present only on a name-change purchase. */
  readonly newName?: string;
}
