import type { Pool } from "pg";
import type { ItemCatalog } from "../item/ItemCatalog";
import { executeShopPurchase } from "./executeShopPurchase";
import { executeShopSale } from "./executeShopSale";
import { runSerializableTransaction } from "./runSerializableTransaction";
import type {
  ShopPurchaseResult,
  ShopSaleResult,
} from "./ShopOperationResult";
import type {
  ShopPurchaseRequest,
  ShopSaleRequest,
  ShopStore,
} from "./ShopStore";
import { validateShopCharacterId } from "./validateShopCharacterId";
import { validateShopPurchase } from "./validateShopPurchase";
import { validateShopSale } from "./validateShopSale";

export class PgShopStore implements ShopStore {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
  ) {}

  async purchase(
    characterId: string,
    request: ShopPurchaseRequest,
  ): Promise<ShopPurchaseResult> {
    validateShopCharacterId(characterId);
    validateShopPurchase(request);
    return runSerializableTransaction(this.pool, (client) =>
      executeShopPurchase(client, characterId, this.catalog, request),
    );
  }

  async sell(
    characterId: string,
    request: ShopSaleRequest,
  ): Promise<ShopSaleResult> {
    validateShopCharacterId(characterId);
    validateShopSale(request);
    return runSerializableTransaction(this.pool, (client) =>
      executeShopSale(client, characterId, this.catalog, request),
    );
  }
}
