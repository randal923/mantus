import { BANK_LIMITS } from "@tibia/protocol";
import type { Pool, PoolClient } from "pg";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "./CurrencyBalance";
import { countMoneyWorth } from "./countMoneyWorth";
import type { OwnedItemRow } from "./OwnedItemRow";
import { PgCoinOperations } from "./PgCoinOperations";
import { planMoneyGrant } from "./planMoneyGrant";
import { planMoneySpend } from "./planMoneySpend";
import type {
  ShopPurchaseResult,
  ShopSaleResult,
} from "./ShopOperationResult";
import type {
  ShopItemSubtype,
  ShopPurchaseRequest,
  ShopSaleRequest,
  ShopStore,
} from "./ShopStore";
import { TransactionRollback } from "./TransactionRollback";

const COIN_STACK_LIMIT = 100;
const SHOP_IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class PgShopStore implements ShopStore {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
  ) {}

  async purchase(
    characterId: string,
    request: ShopPurchaseRequest,
  ): Promise<ShopPurchaseResult> {
    this.validateCharacterId(characterId);
    this.validatePurchase(request);
    return this.transaction(async (client) => {
      const coinOps = new PgCoinOperations(client, characterId, this.catalog);
      const owned = await coinOps.loadOwnedItems();
      const currencyRows = request.currencyItemTypeId === undefined
        ? []
        : coinOps.rowsOfType(owned, request.currencyItemTypeId);
      if (
        request.currencyItemTypeId !== undefined &&
        coinOps.countRows(currencyRows) < request.totalCost
      ) {
        return { status: "insufficient-funds" };
      }
      const coins = coinOps.coinRows(owned);
      const carried = {
        gold: coinOps.countRows(coins.gold),
        platinum: coinOps.countRows(coins.platinum),
        crystal: coinOps.countRows(coins.crystal),
      };
      const carriedWorth = countMoneyWorth(carried);
      const carriedPay = request.currencyItemTypeId === undefined
        ? Math.min(carriedWorth, request.totalCost)
        : 0;
      const bankPay = request.currencyItemTypeId === undefined
        ? request.totalCost - carriedPay
        : 0;
      if (bankPay > 0 && request.currencyItemTypeId === undefined) {
        const balance = await this.lockBalance(client, characterId);
        if (balance < bankPay) return { status: "insufficient-funds" };
      }
      const stockRemaining = await this.reserveStock(client, request);
      if (stockRemaining === null) return { status: "out-of-stock" };
      const plan = planMoneySpend(carried, carriedPay);
      if (!plan) throw new Error("shop payment plan is inconsistent");

      const after = new Map<string, Item>();
      const removedItemIds: string[] = [];
      if (request.currencyItemTypeId !== undefined && request.totalCost > 0) {
        await coinOps.destroyItems(
          currencyRows,
          request.totalCost,
          request.currencyItemTypeId,
          "shop-purchase-currency",
          after,
          removedItemIds,
        );
      }
      const spends = [
        { rows: coins.gold, count: plan.goldSpent, typeId: GOLD_COIN_TYPE_ID },
        {
          rows: coins.platinum,
          count: plan.platinumSpent,
          typeId: PLATINUM_COIN_TYPE_ID,
        },
        {
          rows: coins.crystal,
          count: plan.crystalSpent,
          typeId: CRYSTAL_COIN_TYPE_ID,
        },
      ];
      for (const spend of request.currencyItemTypeId === undefined ? spends : []) {
        await coinOps.destroyItems(
          spend.rows,
          spend.count,
          spend.typeId,
          "shop-purchase",
          after,
          removedItemIds,
        );
      }
      const backpack = await coinOps.lockBackpackSlots(after);
      if (!backpack) {
        throw new TransactionRollback<ShopPurchaseResult>({
          status: "no-space",
        });
      }
      const changeGrants = [
        { rows: coins.gold, count: plan.goldChange, typeId: GOLD_COIN_TYPE_ID },
        {
          rows: coins.platinum,
          count: plan.platinumChange,
          typeId: PLATINUM_COIN_TYPE_ID,
        },
      ];
      for (const grant of changeGrants) {
        const granted = await coinOps.grantStackable(
          grant.rows,
          grant.count,
          grant.typeId,
          COIN_STACK_LIMIT,
          "shop-purchase-change",
          after,
          removedItemIds,
          backpack,
        );
        if (!granted) {
          throw new TransactionRollback<ShopPurchaseResult>({
            status: "no-space",
          });
        }
      }
      const itemAttributes = this.subtypeAttributes(request.subtype);
      const matchingRows = coinOps
        .rowsOfType(owned, request.itemTypeId)
        .filter((row) => this.hasAttributes(row, itemAttributes));
      const granted = request.stackable
        ? await coinOps.grantStackable(
            matchingRows,
            request.amount,
            request.itemTypeId,
            request.maxCount,
            "shop-purchase",
            after,
            removedItemIds,
            backpack,
          )
        : await coinOps.grantSingles(
            request.amount,
            request.itemTypeId,
            "shop-purchase",
            after,
            backpack,
            itemAttributes,
          );
      if (!granted) {
        throw new TransactionRollback<ShopPurchaseResult>({
          status: "no-space",
        });
      }
      if (bankPay > 0 && request.currencyItemTypeId === undefined) {
        const balanceAfter = await this.debitBalance(
          client,
          characterId,
          bankPay,
        );
        await client.query(
          `INSERT INTO bank_ledger (
             character_id, entry_type, amount, balance_after
           ) VALUES ($1, 'shop-purchase', $2, $3)`,
          [characterId, bankPay, balanceAfter],
        );
      }
      await client.query(
        `INSERT INTO audit_log(event_type, character_id, details)
         VALUES (
           'shop-purchase', $1,
           jsonb_build_object(
             'npcTypeId', $2::text, 'shopId', $3::text,
             'offerId', $4::text, 'itemTypeId', $5::integer,
             'amount', $6::integer, 'totalCost', $7::bigint,
             'bankSpent', $8::bigint, 'subtype', $9::integer,
             'stockRemaining', $10::integer,
             'currencyItemTypeId', $11::integer
           )
         )`,
        [
          characterId,
          request.npcTypeId,
          request.shopId,
          request.offerId,
          request.itemTypeId,
          request.amount,
          request.totalCost,
          bankPay,
          request.subtype?.value ?? null,
          stockRemaining ?? null,
          request.currencyItemTypeId ?? null,
        ],
      );
      return {
        status: "committed",
        mutation: { after: [...after.values()], removedItemIds },
        bankSpent: bankPay,
      };
    });
  }

  async sell(
    characterId: string,
    request: ShopSaleRequest,
  ): Promise<ShopSaleResult> {
    this.validateCharacterId(characterId);
    this.validateSale(request);
    return this.transaction(async (client) => {
      const coinOps = new PgCoinOperations(client, characterId, this.catalog);
      const owned = await coinOps.loadOwnedItems();
      const sellable = this.sellableRows(
        owned,
        request.itemTypeId,
        request.subtype,
      );
      if (coinOps.countRows(sellable) < request.amount) {
        return { status: "not-owned" };
      }
      const after = new Map<string, Item>();
      const removedItemIds: string[] = [];
      await coinOps.destroyItems(
        sellable,
        request.amount,
        request.itemTypeId,
        "shop-sale",
        after,
        removedItemIds,
      );
      const backpack = await coinOps.lockBackpackSlots(after);
      if (!backpack) {
        throw new TransactionRollback<ShopSaleResult>({ status: "no-space" });
      }
      const coins = coinOps.coinRows(owned);
      const proceeds = planMoneyGrant(request.totalProceeds);
      const grants = [
        {
          rows: coins.crystal,
          count: proceeds.crystal,
          typeId: CRYSTAL_COIN_TYPE_ID,
        },
        {
          rows: coins.platinum,
          count: proceeds.platinum,
          typeId: PLATINUM_COIN_TYPE_ID,
        },
        { rows: coins.gold, count: proceeds.gold, typeId: GOLD_COIN_TYPE_ID },
      ];
      const currencyRows = request.currencyItemTypeId === undefined
        ? []
        : coinOps.rowsOfType(owned, request.currencyItemTypeId);
      const currencyGranted = request.currencyItemTypeId === undefined
        ? true
        : await coinOps.grantStackable(
            currencyRows,
            request.totalProceeds,
            request.currencyItemTypeId,
            request.currencyMaxCount ?? 0,
            "shop-sale-currency",
            after,
            removedItemIds,
            backpack,
          );
      if (!currencyGranted) {
        throw new TransactionRollback<ShopSaleResult>({ status: "no-space" });
      }
      for (const grant of request.currencyItemTypeId === undefined ? grants : []) {
        const granted = await coinOps.grantStackable(
          grant.rows,
          grant.count,
          grant.typeId,
          COIN_STACK_LIMIT,
          "shop-sale",
          after,
          removedItemIds,
          backpack,
        );
        if (!granted) {
          throw new TransactionRollback<ShopSaleResult>({
            status: "no-space",
          });
        }
      }
      await client.query(
        `INSERT INTO audit_log(event_type, character_id, details)
         VALUES (
           'shop-sale', $1,
           jsonb_build_object(
             'npcTypeId', $2::text, 'shopId', $3::text,
             'offerId', $4::text, 'itemTypeId', $5::integer,
             'amount', $6::integer, 'totalProceeds', $7::bigint,
             'subtype', $8::integer,
             'currencyItemTypeId', $9::integer
           )
         )`,
        [
          characterId,
          request.npcTypeId,
          request.shopId,
          request.offerId,
          request.itemTypeId,
          request.amount,
          request.totalProceeds,
          request.subtype?.value ?? null,
          request.currencyItemTypeId ?? null,
        ],
      );
      return {
        status: "committed",
        mutation: { after: [...after.values()], removedItemIds },
      };
    });
  }

  /**
   * Rows the player may sell: not equipped, and not a container that still
   * holds other items (deleting those would orphan the contents).
   */
  private sellableRows(
    owned: ReadonlyArray<OwnedItemRow>,
    itemTypeId: number,
    subtype?: ShopItemSubtype,
  ): OwnedItemRow[] {
    const parents = new Set(
      owned.flatMap((row) => (row.container_id ? [row.container_id] : [])),
    );
    return owned
      .filter(
        (row) =>
          row.item_type_id === itemTypeId &&
          row.location_type !== "equipment" &&
          !parents.has(row.id) &&
          this.hasSubtype(row, subtype),
      )
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private async reserveStock(
    client: PoolClient,
    request: ShopPurchaseRequest,
  ): Promise<number | null | undefined> {
    if (request.stock === undefined) return undefined;
    await client.query(
      `INSERT INTO shop_stock (
         shop_id, offer_id, initial_stock, remaining_stock
       ) VALUES ($1, $2, $3, $3)
       ON CONFLICT (shop_id, offer_id) DO NOTHING`,
      [request.shopId, request.offerId, request.stock],
    );
    const locked = await client.query<{
      initial_stock: number;
      remaining_stock: number;
    }>(
      `SELECT initial_stock, remaining_stock FROM shop_stock
       WHERE shop_id = $1 AND offer_id = $2
       FOR UPDATE`,
      [request.shopId, request.offerId],
    );
    const row = locked.rows[0];
    if (!row) throw new Error("shop stock is missing");
    if (row.initial_stock !== request.stock) {
      throw new Error("shop stock does not match the current catalog");
    }
    if (row.remaining_stock < request.amount) return null;
    const remaining = row.remaining_stock - request.amount;
    await client.query(
      `UPDATE shop_stock
       SET remaining_stock = $3, version = version + 1, updated_at = now()
       WHERE shop_id = $1 AND offer_id = $2`,
      [request.shopId, request.offerId, remaining],
    );
    return remaining;
  }

  private subtypeAttributes(
    subtype?: ShopItemSubtype,
  ): Readonly<Record<string, unknown>> {
    if (!subtype) return {};
    return subtype.kind === "charges"
      ? { charges: subtype.value }
      : { fluidType: subtype.value };
  }

  private hasSubtype(row: OwnedItemRow, subtype?: ShopItemSubtype): boolean {
    if (!subtype) return true;
    return this.hasAttributes(row, this.subtypeAttributes(subtype));
  }

  private hasAttributes(
    row: OwnedItemRow,
    expected: Readonly<Record<string, unknown>>,
  ): boolean {
    if (
      !row.attributes ||
      typeof row.attributes !== "object" ||
      Array.isArray(row.attributes)
    ) {
      throw new Error(`item ${row.id} has invalid attributes`);
    }
    const attributes = row.attributes as Record<string, unknown>;
    const expectedEntries = Object.entries(expected);
    return (
      Object.keys(attributes).length === expectedEntries.length &&
      expectedEntries.every(([key, value]) => attributes[key] === value)
    );
  }

  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (cause) {
      await client.query("ROLLBACK");
      if (cause instanceof TransactionRollback) return cause.result as T;
      throw cause;
    } finally {
      client.release();
    }
  }

  private async lockBalance(
    client: PoolClient,
    characterId: string,
  ): Promise<number> {
    await client.query(
      `INSERT INTO bank_accounts (character_id)
       VALUES ($1)
       ON CONFLICT (character_id) DO NOTHING`,
      [characterId],
    );
    const result = await client.query<{ balance: string }>(
      "SELECT balance FROM bank_accounts WHERE character_id = $1 FOR UPDATE",
      [characterId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("bank account is missing");
    return this.parseBalance(row.balance);
  }

  private async debitBalance(
    client: PoolClient,
    characterId: string,
    amount: number,
  ): Promise<number> {
    const result = await client.query<{ balance: string }>(
      `UPDATE bank_accounts
       SET balance = balance - $2, version = version + 1, updated_at = now()
       WHERE character_id = $1 AND balance >= $2
       RETURNING balance`,
      [characterId, amount],
    );
    const row = result.rows[0];
    if (!row) throw new Error("shop bank debit failed");
    return this.parseBalance(row.balance);
  }

  private parseBalance(value: string | number): number {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error("bank balance is out of range");
    }
    return parsed;
  }

  private validateCharacterId(characterId: string): void {
    if (characterId.length === 0 || characterId.length > 128) {
      throw new Error("invalid shop character id");
    }
  }

  private validatePurchase(request: ShopPurchaseRequest): void {
    this.validateCommon(
      request.npcTypeId,
      request.shopId,
      request.offerId,
      request.itemTypeId,
      request.amount,
      request.unitPrice,
      request.subtype,
    );
    this.validateCurrency(
      request.currencyItemTypeId,
      request.currencyMaxCount,
    );
    if (
      request.totalCost !== request.unitPrice * request.amount ||
      request.totalCost > BANK_LIMITS.maxTransactionAmount ||
      !Number.isInteger(request.maxCount) ||
      request.maxCount < 1 ||
      request.maxCount > 100 ||
      (request.stackable && request.subtype !== undefined) ||
      (request.stock !== undefined &&
        (!Number.isInteger(request.stock) ||
          request.stock < 1 ||
          request.stock > 1_000_000_000))
    ) {
      throw new Error("invalid shop purchase request");
    }
  }

  private validateSale(request: ShopSaleRequest): void {
    this.validateCommon(
      request.npcTypeId,
      request.shopId,
      request.offerId,
      request.itemTypeId,
      request.amount,
      request.unitPrice,
      request.subtype,
    );
    this.validateCurrency(
      request.currencyItemTypeId,
      request.currencyMaxCount,
    );
    if (
      request.totalProceeds !== request.unitPrice * request.amount ||
      request.totalProceeds > BANK_LIMITS.maxTransactionAmount
    ) {
      throw new Error("invalid shop sale request");
    }
  }

  private validateCommon(
    npcTypeId: string,
    shopId: string,
    offerId: string,
    itemTypeId: number,
    amount: number,
    unitPrice: number,
    subtype?: ShopItemSubtype,
  ): void {
    if (
      !SHOP_IDENTIFIER.test(npcTypeId) ||
      npcTypeId.length > 64 ||
      !SHOP_IDENTIFIER.test(shopId) ||
      shopId.length > 64 ||
      !SHOP_IDENTIFIER.test(offerId) ||
      offerId.length > 64 ||
      !Number.isInteger(itemTypeId) ||
      itemTypeId < 1 ||
      itemTypeId > 65_535 ||
      !Number.isInteger(amount) ||
      amount < 1 ||
      amount > 100 ||
      !Number.isInteger(unitPrice) ||
      unitPrice < 0 ||
      unitPrice > 1_000_000_000 ||
      (subtype !== undefined &&
        ((!Number.isInteger(subtype.value) ||
          subtype.value < 1 ||
          subtype.value > 65_535) ||
          (subtype.kind !== "charges" && subtype.kind !== "fluid")))
    ) {
      throw new Error("invalid shop request");
    }
  }

  private validateCurrency(
    itemTypeId: number | undefined,
    maxCount: number | undefined,
  ): void {
    if (itemTypeId === undefined && maxCount === undefined) return;
    if (
      itemTypeId === undefined ||
      maxCount === undefined ||
      !Number.isInteger(itemTypeId) ||
      itemTypeId < 1 ||
      itemTypeId > 65_535 ||
      !Number.isInteger(maxCount) ||
      maxCount < 1 ||
      maxCount > 100
    ) {
      throw new Error("invalid shop currency");
    }
  }
}
