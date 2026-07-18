import { randomUUID } from "node:crypto";
import type {
  ShopActionFailedReason,
  ShopBuyMessage,
  ShopSellMessage,
} from "@tibia/protocol";
import { Npc } from "../creature/Npc";
import type { ItemMutation } from "../item/ItemMutation";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { World } from "../World";
import { inNpcTalkRange } from "./inNpcTalkRange";
import { isShopEntryAvailable } from "./isShopEntryAvailable";
import { npcOwnsShop } from "./npcOwnsShop";
import { projectShopCurrency } from "./projectShopCurrency";
import { projectShopEntry } from "./projectShopEntry";
import { projectShopPages } from "./projectShopPages";
import { resolveShopSubtype } from "./resolveShopSubtype";
import type { ShopCatalog } from "./ShopCatalog";
import { ShopPrechecks } from "./ShopPrechecks";
import type { ShopStore } from "./ShopStore";

type ShopIntent = ShopBuyMessage | ShopSellMessage;

interface OpenShopAuthorization {
  readonly id: string;
  readonly characterId: string;
  readonly npcId: string;
  readonly shopId: string;
  readonly expiresAt: number;
}

export class ShopService {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly openShops = new WeakMap<Session, OpenShopAuthorization>();
  private readonly prechecks: ShopPrechecks;

  constructor(
    private readonly world: World,
    private readonly items: ItemIntentHandler,
    private readonly catalogs: ReadonlyMap<string, ShopCatalog>,
    private readonly store?: ShopStore,
  ) {
    this.prechecks = new ShopPrechecks(items);
  }

  applyResolvedOutcomes(now: number): void {
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

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
    if (
      !this.store ||
      !player ||
      !catalog ||
      session.itemOperationPending ||
      session.itemPersistsPending > 0 ||
      session.travelOperationPending ||
      this.world.getCreature(npc.id) !== npc ||
      !session.knownCreatureIds.has(npc.id) ||
      catalog.npcTypeId !== npc.type.id ||
      !npcOwnsShop(npc, shopId) ||
      !inNpcTalkRange(player, npc)
    ) {
      return "unavailable";
    }
    const entries = catalog.entries
      .filter((entry) => isShopEntryAvailable(player, entry))
      .flatMap((entry) =>
        projectShopEntry(entry, this.items.itemType(entry.itemTypeId)),
      );
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
    const store = this.store;
    const player = session.playerId
      ? this.world.getPlayer(session.playerId)
      : undefined;
    if (!store || !player) {
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
    if (session.itemOperationPending ||
      session.itemPersistsPending > 0 ||
      session.travelOperationPending) {
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

    if (intent.type === "shop-buy") {
      const buyPrice = entry.buyPrice;
      if (buyPrice === undefined) {
        this.fail(session, "invalid-item");
        return;
      }
      const totalCost = buyPrice * intent.amount;
      const precheck = this.prechecks.precheckPurchase(
        player,
        type.weight,
        intent.amount,
        totalCost,
        catalog.currencyItemTypeId,
      );
      if (precheck) {
        this.fail(session, precheck);
        return;
      }
      this.execute(session, player, {
        run: () =>
          store.purchase(player.id, {
            npcTypeId: npc.type.id,
            shopId: open.shopId,
            offerId: entry.offerId,
            itemTypeId: entry.itemTypeId,
            amount: intent.amount,
            unitPrice: buyPrice,
            totalCost,
            stackable: type.stackable,
            maxCount: type.maxCount,
            ...(catalog.currencyItemTypeId === undefined || !currencyType
              ? {}
              : {
                  currencyItemTypeId: catalog.currencyItemTypeId,
                  currencyMaxCount: currencyType.maxCount,
                }),
            ...(subtype === undefined ? {} : { subtype }),
            ...(entry.stock === undefined ? {} : { stock: entry.stock }),
          }),
        kind: "purchase",
        offerId: entry.offerId,
        name: entry.name,
        itemTypeId: entry.itemTypeId,
        amount: intent.amount,
        totalPrice: totalCost,
      });
      return;
    }
    const sellPrice = entry.sellPrice;
    if (sellPrice === undefined) {
      this.fail(session, "invalid-item");
      return;
    }
    if (
      this.prechecks.countSellable(player, entry.itemTypeId, subtype) <
      intent.amount
    ) {
      this.fail(session, "not-owned");
      return;
    }
    const salePrecheck = this.prechecks.precheckSale(
      player,
      type.weight,
      intent.amount,
      sellPrice * intent.amount,
      catalog.currencyItemTypeId,
    );
    if (salePrecheck) {
      this.fail(session, salePrecheck);
      return;
    }
    this.execute(session, player, {
      run: () =>
        store.sell(player.id, {
          npcTypeId: npc.type.id,
          shopId: open.shopId,
          offerId: entry.offerId,
          itemTypeId: entry.itemTypeId,
          amount: intent.amount,
          unitPrice: sellPrice,
          totalProceeds: sellPrice * intent.amount,
          ...(catalog.currencyItemTypeId === undefined || !currencyType
            ? {}
            : {
                currencyItemTypeId: catalog.currencyItemTypeId,
                currencyMaxCount: currencyType.maxCount,
              }),
          ...(subtype === undefined ? {} : { subtype }),
        }),
      kind: "sale",
      offerId: entry.offerId,
      name: entry.name,
      itemTypeId: entry.itemTypeId,
      amount: intent.amount,
      totalPrice: sellPrice * intent.amount,
    });
  }

  private execute(
    session: Session,
    player: Player,
    operation: {
      run: () => Promise<
        | { status: "committed"; mutation: ItemMutation }
        | { status: Exclude<ShopActionFailedReason, never> }
      >;
      kind: "purchase" | "sale";
      offerId: string;
      name: string;
      itemTypeId: number;
      amount: number;
      totalPrice: number;
    },
  ): void {
    session.itemOperationPending = true;
    const resolution = operation.run().then(
      (result) => {
        this.outcomes.push((at) => {
          if (result.status !== "committed") {
            if (session.playerId !== player.id) return;
            session.itemOperationPending = false;
            this.fail(session, result.status);
            return;
          }
          this.items.applyCommittedMutation(
            session,
            player.id,
            result.mutation,
            at,
          );
          if (session.playerId !== player.id) return;
          session.itemOperationPending = false;
          session.send({
            type: "shop-transacted",
            kind: operation.kind,
            offerId: operation.offerId,
            itemTypeId: operation.itemTypeId,
            name: operation.name,
            amount: operation.amount,
            totalPrice: operation.totalPrice,
          });
        });
      },
      (cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(
          `shop ${operation.kind} failed for character ${player.id}: ${reason}`,
        );
        this.outcomes.push(() => {
          if (session.playerId !== player.id) return;
          session.itemOperationPending = false;
          this.fail(session, "failed");
        });
      },
    );
    this.pendingOperations.add(resolution);
    void resolution.finally(() => this.pendingOperations.delete(resolution));
    this.items.trackExternalOperation(player.id, resolution);
  }

  private fail(session: Session, reason: ShopActionFailedReason): void {
    session.send({ type: "shop-action-failed", reason });
  }
}
