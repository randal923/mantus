import { randomUUID } from "node:crypto";
import {
  SHOP_LIMITS,
  type ShopActionFailedReason,
  type ShopBuyMessage,
  type ShopSellMessage,
} from "@tibia/protocol";
import { Npc } from "../creature/Npc";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { ItemMutation } from "../item/ItemMutation";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { World } from "../World";
import type { EconomyPersistPlan } from "./EconomyPersistPlan";
import type { EconomyPersistStore } from "./EconomyPersistStore";
import { inNpcTalkRange } from "./inNpcTalkRange";
import { isShopEntryAvailable } from "./isShopEntryAvailable";
import { npcOwnsShop } from "./npcOwnsShop";
import { CarriedItemDraft } from "./plan/CarriedItemDraft";
import { planShopPurchase } from "./plan/planShopPurchase";
import { planShopSale } from "./plan/planShopSale";
import { projectShopCurrency } from "./projectShopCurrency";
import { projectShopEntry } from "./projectShopEntry";
import { projectShopPages } from "./projectShopPages";
import { resolveShopSubtype } from "./resolveShopSubtype";
import type { ShopCatalog } from "./ShopCatalog";
import { shopSubtypeAttributes } from "./shopSubtypeAttributes";
import type { ShopStockCache } from "./ShopStockCache";

type ShopIntent = ShopBuyMessage | ShopSellMessage;

interface OpenShopAuthorization {
  readonly id: string;
  readonly characterId: string;
  readonly npcId: string;
  readonly shopId: string;
  readonly expiresAt: number;
}

/**
 * Buying and selling at an NPC, computed entirely in memory inside the tick and
 * flushed to the database behind it — the same shape as Canary, where a
 * purchase never waits on storage.
 *
 * The only throttle is a server-owned 250 ms exhaust, matching Canary's UI
 * exhaust. Nothing here waits on a pending write: ordering is the persist
 * lane's job, so repeated purchases no longer refuse each other.
 */
export class ShopService {
  private readonly openShops = new WeakMap<Session, OpenShopAuthorization>();

  constructor(
    private readonly world: World,
    private readonly items: ItemIntentHandler,
    private readonly catalogs: ReadonlyMap<string, ShopCatalog>,
    private readonly itemCatalog: ItemCatalog,
    private readonly stock: ShopStockCache,
    private readonly persist?: EconomyPersistStore,
  ) {}

  /** Opens the shop window from a dialogue action; purely a projection. */
  open(
    session: Session,
    npc: Npc,
    shopId: string,
    now: number,
  ): "opened" | "unavailable" {
    const player = session.playerId
      ? this.world.getPlayer(session.playerId)
      : undefined;
    const catalog = this.catalogs.get(shopId);
    const snapshot = player
      ? this.items.inventorySnapshot(player.id)
      : undefined;
    if (
      !this.persist ||
      !player ||
      !snapshot ||
      !catalog ||
      session.itemOperationPending ||
      session.travelOperationPending ||
      this.world.getCreature(npc.id) !== npc ||
      !session.knownCreatureIds.has(npc.id) ||
      catalog.npcTypeId !== npc.type.id ||
      !npcOwnsShop(npc, shopId) ||
      !inNpcTalkRange(player, npc)
    ) {
      return "unavailable";
    }
    const draft = new CarriedItemDraft(
      this.itemCatalog,
      player.id,
      snapshot.items,
      snapshot.capacityMax,
    );
    const entries = catalog.entries
      .filter((entry) => isShopEntryAvailable(player, entry))
      .flatMap((entry) => {
        const type = this.items.itemType(entry.itemTypeId);
        const subtype = type ? resolveShopSubtype(entry, type) : null;
        const owned =
          entry.sellPrice === undefined || subtype === null
            ? 0
            : draft.countOf(
                entry.itemTypeId,
                subtype === undefined
                  ? undefined
                  : shopSubtypeAttributes(subtype),
              );
        return projectShopEntry(entry, type, owned);
      });
    if (entries.length === 0) return "unavailable";
    const currency = projectShopCurrency(this.items, player, catalog);
    if (!currency) return "unavailable";
    const shopSessionId = randomUUID();
    const pages = projectShopPages(
      npc,
      shopId,
      shopSessionId,
      entries,
      currency,
    );
    if (!pages) return "unavailable";
    this.openShops.set(session, {
      id: shopSessionId,
      characterId: player.id,
      npcId: npc.id,
      shopId,
      expiresAt: now + (npc.type.dialogue?.timeoutMs ?? 0),
    });
    pages.forEach((pageEntries, index) => {
      session.send({
        type: "shop-opened",
        npcId: npc.id,
        npcName: npc.name,
        shopId,
        shopSessionId,
        ...currency,
        bankBalance: snapshot.bankBalance,
        page: index + 1,
        pageCount: pages.length,
        entries: pageEntries,
      });
    });
    return "opened";
  }

  close(session: Session, npcId: string): void {
    const open = this.openShops.get(session);
    if (open?.npcId === npcId) this.openShops.delete(session);
  }

  handle(session: Session, intent: ShopIntent, now: number): void {
    const persist = this.persist;
    const player = session.playerId
      ? this.world.getPlayer(session.playerId)
      : undefined;
    if (!persist || !player) {
      this.fail(session, "failed");
      return;
    }
    const open = this.openShops.get(session);
    if (
      !open ||
      open.id !== intent.shopSessionId ||
      open.characterId !== player.id ||
      open.npcId !== intent.npcId
    ) {
      this.fail(session, "unavailable");
      return;
    }
    if (now >= open.expiresAt) {
      this.openShops.delete(session);
      this.fail(session, "unavailable");
      return;
    }
    const npc = this.world.getCreature(open.npcId);
    const catalog = this.catalogs.get(open.shopId);
    if (
      !(npc instanceof Npc) ||
      !session.knownCreatureIds.has(npc.id) ||
      !catalog ||
      catalog.npcTypeId !== npc.type.id ||
      !npcOwnsShop(npc, open.shopId)
    ) {
      this.openShops.delete(session);
      this.fail(session, "unavailable");
      return;
    }
    if (!inNpcTalkRange(player, npc)) {
      this.openShops.delete(session);
      this.fail(session, "out-of-range");
      return;
    }
    // A DB-first operation (trade, forge, conjure) has read rows and not yet
    // reconciled them with memory, so its items are not safe to plan against.
    // Memory-first writes still in flight are fine: the persist lane orders
    // them, which is what lets purchases repeat without refusing each other.
    if (session.itemOperationPending || session.travelOperationPending) {
      this.fail(session, "busy");
      return;
    }
    if (now < session.shopExhaustReadyAt) {
      this.fail(session, "busy");
      return;
    }
    const entry = catalog.entries.find(
      (candidate) => candidate.offerId === intent.offerId,
    );
    const type = entry ? this.items.itemType(entry.itemTypeId) : undefined;
    const currencyType = catalog.currencyItemTypeId === undefined
      ? undefined
      : this.items.itemType(catalog.currencyItemTypeId);
    const subtype = entry && type ? resolveShopSubtype(entry, type) : null;
    if (
      !entry ||
      !type ||
      (catalog.currencyItemTypeId !== undefined &&
        (!currencyType || !currencyType.stackable)) ||
      subtype === null ||
      intent.amount < entry.minimumAmount ||
      intent.amount > entry.maximumAmount
    ) {
      this.fail(session, "invalid-item");
      return;
    }
    if (!isShopEntryAvailable(player, entry)) {
      this.fail(session, "unavailable");
      return;
    }
    const snapshot = this.items.inventorySnapshot(player.id);
    if (!snapshot) {
      this.fail(session, "failed");
      return;
    }
    const carried = {
      items: snapshot.items,
      capacityMax: snapshot.capacityMax,
      bankBalance: snapshot.bankBalance,
    };
    const common = {
      characterId: player.id,
      catalog: this.itemCatalog,
      carried,
      npcTypeId: npc.type.id,
      shopId: open.shopId,
      offerId: entry.offerId,
      itemTypeId: entry.itemTypeId,
      amount: intent.amount,
      ...(subtype === undefined ? {} : { subtype }),
      ...(catalog.currencyItemTypeId === undefined
        ? {}
        : { currencyItemTypeId: catalog.currencyItemTypeId }),
    };

    if (intent.type === "shop-buy") {
      const unitPrice = entry.buyPrice;
      if (unitPrice === undefined) {
        this.fail(session, "invalid-item");
        return;
      }
      const stock = this.stock.get(open.shopId, entry.offerId);
      const planned = planShopPurchase({
        ...common,
        unitPrice,
        ...(stock === undefined ? {} : { stock }),
      });
      if (planned.status !== "planned") {
        this.fail(session, planned.status);
        return;
      }
      this.commit(session, player, now, {
        mutation: planned.mutation,
        persist: planned.persist,
        bankBalanceAfter: planned.bankBalanceAfter,
        ...(planned.stockRemaining === undefined
          ? {}
          : {
              reserved: {
                shopId: open.shopId,
                offerId: entry.offerId,
                amount: intent.amount,
              },
            }),
        transacted: {
          kind: "purchase",
          offerId: entry.offerId,
          itemTypeId: entry.itemTypeId,
          name: entry.name,
          amount: intent.amount,
          totalPrice: unitPrice * intent.amount,
        },
      });
      return;
    }

    const unitPrice = entry.sellPrice;
    if (unitPrice === undefined) {
      this.fail(session, "invalid-item");
      return;
    }
    const planned = planShopSale({ ...common, unitPrice });
    if (planned.status !== "planned") {
      this.fail(session, planned.status);
      return;
    }
    this.commit(session, player, now, {
      mutation: planned.mutation,
      persist: planned.persist,
      bankBalanceAfter: planned.bankBalanceAfter,
      transacted: {
        kind: "sale",
        offerId: entry.offerId,
        itemTypeId: entry.itemTypeId,
        name: entry.name,
        amount: intent.amount,
        totalPrice: unitPrice * intent.amount,
        ...(planned.bankCredited === 0
          ? {}
          : { bankCredited: planned.bankCredited }),
      },
    });
  }

  /**
   * Applies the planned mutation to memory this tick, tells the player, and
   * queues the single transaction that makes it durable. The write goes on the
   * shared item lane, so it lands in order behind every earlier mutation.
   */
  private commit(
    session: Session,
    player: Player,
    now: number,
    operation: {
      mutation: ItemMutation;
      persist: EconomyPersistPlan;
      bankBalanceAfter: number;
      reserved?: { shopId: string; offerId: string; amount: number };
      transacted: {
        kind: "purchase" | "sale";
        offerId: string;
        itemTypeId: number;
        name: string;
        amount: number;
        totalPrice: number;
        bankCredited?: number;
      };
    },
  ): void {
    const before = this.items.inventorySnapshot(player.id)?.bankBalance ?? 0;
    this.items.applyCommittedMutation(
      session,
      player.id,
      operation.mutation,
      now,
    );
    if (operation.bankBalanceAfter !== before) {
      this.items.setBankBalance(player.id, operation.bankBalanceAfter);
      session.send({
        type: "bank-updated",
        balance: operation.bankBalanceAfter,
      });
    }
    if (operation.reserved) {
      this.stock.reserve(
        operation.reserved.shopId,
        operation.reserved.offerId,
        operation.reserved.amount,
      );
    }
    session.shopExhaustReadyAt = now + SHOP_LIMITS.exhaustMs;
    const persist = this.persist;
    if (persist) {
      this.items.enqueuePersist(session, player.id, () =>
        persist.persist(operation.persist),
      );
    }
    session.send({ type: "shop-transacted", ...operation.transacted });
  }

  private fail(session: Session, reason: ShopActionFailedReason): void {
    session.send({ type: "shop-action-failed", reason });
  }
}
