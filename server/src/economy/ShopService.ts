import { randomUUID } from "node:crypto";
import {
  PROTOCOL_LIMITS,
  type ShopActionFailedReason,
  type ShopBuyMessage,
  type ShopEntryProjection,
  type ShopSellMessage,
} from "@tibia/protocol";
import { Npc } from "../creature/Npc";
import type { Item } from "../item/Item";
import type { ItemMutation } from "../item/ItemMutation";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { ItemType } from "../item/ItemType";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { World } from "../World";
import type { ShopCatalog, ShopEntry } from "./ShopCatalog";
import { countMoneyWorth } from "./countMoneyWorth";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
  type CurrencyBalance,
} from "./CurrencyBalance";
import { planMoneyGrant } from "./planMoneyGrant";
import { planMoneySpend } from "./planMoneySpend";
import type { ShopItemSubtype, ShopStore } from "./ShopStore";

type ShopIntent = ShopBuyMessage | ShopSellMessage;

interface OpenShopAuthorization {
  readonly id: string;
  readonly characterId: string;
  readonly npcId: string;
  readonly shopId: string;
  readonly expiresAt: number;
}

interface ShopCurrencyProjection {
  readonly currencyItemTypeId: number;
  readonly currencySpriteId: number;
  readonly currencyName: string;
  readonly currencyAmount: number;
}

export class ShopService {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly openShops = new WeakMap<Session, OpenShopAuthorization>();

  constructor(
    private readonly world: World,
    private readonly items: ItemIntentHandler,
    private readonly catalogs: ReadonlyMap<string, ShopCatalog>,
    private readonly store?: ShopStore,
  ) {}

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
      session.travelOperationPending ||
      this.world.getCreature(npc.id) !== npc ||
      !session.knownCreatureIds.has(npc.id) ||
      catalog.npcTypeId !== npc.type.id ||
      !this.npcOwnsShop(npc, shopId) ||
      !this.inTalkRange(player, npc)
    ) {
      return "unavailable";
    }
    const entries = catalog.entries
      .filter((entry) => this.isAvailable(player, entry))
      .flatMap((entry) => this.projectEntry(entry));
    if (entries.length === 0) return "unavailable";
    const currency = this.currencyProjection(player, catalog);
    if (!currency) return "unavailable";
    const shopSessionId = randomUUID();
    const pages = this.projectPages(
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
      !this.npcOwnsShop(npc, open.shopId)
    ) {
      this.openShops.delete(session);
      this.fail(session, "unavailable");
      return;
    }
    if (!this.inTalkRange(player, npc)) {
      this.openShops.delete(session);
      this.fail(session, "out-of-range");
      return;
    }
    if (session.itemOperationPending || session.travelOperationPending) {
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
    const subtype = entry && type ? this.resolveSubtype(entry, type) : null;
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
    if (!this.isAvailable(player, entry)) {
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
      const precheck = this.precheckPurchase(
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
    if (this.countSellable(player, entry.itemTypeId, subtype) < intent.amount) {
      this.fail(session, "not-owned");
      return;
    }
    const salePrecheck = this.precheckSale(
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

  /** Fast in-memory checks at execution time; the store re-validates in SQL. */
  private precheckPurchase(
    player: Player,
    unitWeight: number,
    amount: number,
    totalCost: number,
    currencyItemTypeId?: number,
  ): ShopActionFailedReason | null {
    const snapshot = this.items.inventorySnapshot(player.id);
    if (!snapshot) return "failed";
    if (currencyItemTypeId !== undefined) {
      if (this.countType(snapshot.items, currencyItemTypeId) < totalCost) {
        return "insufficient-funds";
      }
      const weightAfter =
        this.usedWeight(snapshot.items) -
        this.itemWeight(currencyItemTypeId) * totalCost +
        unitWeight * amount;
      return weightAfter > snapshot.capacityMax * 100 ? "no-capacity" : null;
    }
    const carried = this.countCarried(snapshot.items);
    const plan = planMoneySpend(
      carried,
      Math.min(countMoneyWorth(carried), totalCost),
    );
    if (!plan) return "failed";
    const paymentWeight =
      plan.goldSpent * this.itemWeight(GOLD_COIN_TYPE_ID) +
      plan.platinumSpent * this.itemWeight(PLATINUM_COIN_TYPE_ID) +
      plan.crystalSpent * this.itemWeight(CRYSTAL_COIN_TYPE_ID) -
      plan.goldChange * this.itemWeight(GOLD_COIN_TYPE_ID) -
      plan.platinumChange * this.itemWeight(PLATINUM_COIN_TYPE_ID);
    const weightAfter =
      this.usedWeight(snapshot.items) - paymentWeight + unitWeight * amount;
    if (weightAfter > snapshot.capacityMax * 100) {
      return "no-capacity";
    }
    return null;
  }

  private precheckSale(
    player: Player,
    unitWeight: number,
    amount: number,
    totalProceeds: number,
    currencyItemTypeId?: number,
  ): ShopActionFailedReason | null {
    const snapshot = this.items.inventorySnapshot(player.id);
    if (!snapshot) return "failed";
    if (currencyItemTypeId !== undefined) {
      const weightAfter =
        this.usedWeight(snapshot.items) -
        unitWeight * amount +
        this.itemWeight(currencyItemTypeId) * totalProceeds;
      return weightAfter > snapshot.capacityMax * 100 ? "no-capacity" : null;
    }
    const grant = planMoneyGrant(totalProceeds);
    const proceedsWeight =
      grant.gold * this.itemWeight(GOLD_COIN_TYPE_ID) +
      grant.platinum * this.itemWeight(PLATINUM_COIN_TYPE_ID) +
      grant.crystal * this.itemWeight(CRYSTAL_COIN_TYPE_ID);
    const weightAfter =
      this.usedWeight(snapshot.items) - unitWeight * amount + proceedsWeight;
    return weightAfter > snapshot.capacityMax * 100 ? "no-capacity" : null;
  }

  private countSellable(
    player: Player,
    itemTypeId: number,
    subtype?: ShopItemSubtype,
  ): number {
    const snapshot = this.items.inventorySnapshot(player.id);
    if (!snapshot) return 0;
    const parentIds = new Set(
      snapshot.items.flatMap((item) =>
        item.location.kind === "container" || item.location.kind === "corpse"
          ? [item.location.containerId]
          : [],
      ),
    );
    return snapshot.items
      .filter(
        (item) =>
          item.typeId === itemTypeId &&
          item.location.kind !== "equipment" &&
          !parentIds.has(item.id) &&
          this.itemHasSubtype(item, subtype),
      )
      .reduce((total, item) => total + item.count, 0);
  }

  private projectEntry(entry: ShopEntry): ShopEntryProjection[] {
    const type = this.items.itemType(entry.itemTypeId);
    if (!type || this.resolveSubtype(entry, type) === null) return [];
    return [
      {
        offerId: entry.offerId,
        itemTypeId: entry.itemTypeId,
        clientId: type.clientId,
        spriteId: type.spriteId,
        name: entry.name,
        stackable: type.stackable,
        maxCount: type.maxCount,
        weight: type.weight,
        ...(type.stowable && entry.subtype === undefined
          ? { stowable: true }
          : {}),
        minimumAmount: entry.minimumAmount,
        maximumAmount: entry.maximumAmount,
        ...(entry.subtype === undefined ? {} : { subtype: entry.subtype }),
        ...(entry.buyPrice === undefined ? {} : { buyPrice: entry.buyPrice }),
        ...(entry.sellPrice === undefined
          ? {}
          : { sellPrice: entry.sellPrice }),
      },
    ];
  }

  private projectPages(
    npc: Npc,
    shopId: string,
    shopSessionId: string,
    entries: ReadonlyArray<ShopEntryProjection>,
    currency: ShopCurrencyProjection,
  ): ShopEntryProjection[][] | null {
    const pages: ShopEntryProjection[][] = [];
    let current: ShopEntryProjection[] = [];
    for (const entry of entries) {
      const candidate = [...current, entry];
      const bytes = Buffer.byteLength(
        JSON.stringify({
          type: "shop-opened",
          npcId: npc.id,
          npcName: npc.name,
          shopId,
          shopSessionId,
          ...currency,
          page: 256,
          pageCount: 256,
          entries: candidate,
        }),
      );
      if (bytes <= PROTOCOL_LIMITS.maxMessageBytes) {
        current = candidate;
        continue;
      }
      if (current.length === 0) return null;
      pages.push(current);
      current = [entry];
      const singleEntryBytes = Buffer.byteLength(
        JSON.stringify({
          type: "shop-opened",
          npcId: npc.id,
          npcName: npc.name,
          shopId,
          shopSessionId,
          ...currency,
          page: 256,
          pageCount: 256,
          entries: current,
        }),
      );
      if (singleEntryBytes > PROTOCOL_LIMITS.maxMessageBytes) return null;
    }
    if (current.length > 0) pages.push(current);
    return pages.length > 0 && pages.length <= 256 ? pages : null;
  }

  private resolveSubtype(
    entry: ShopEntry,
    type: ItemType,
  ): ShopItemSubtype | null | undefined {
    if (entry.subtype === undefined) return undefined;
    if (type.stackable) return null;
    if (type.charges !== undefined) {
      return { kind: "charges", value: entry.subtype };
    }
    if (
      (type.render.fluidContainer || type.render.splash) &&
      entry.subtype <= 255
    ) {
      return { kind: "fluid", value: entry.subtype };
    }
    return null;
  }

  private isAvailable(player: Player, entry: ShopEntry): boolean {
    if (entry.minimumLevel !== undefined && player.level < entry.minimumLevel) {
      return false;
    }
    if (entry.vocations && !entry.vocations.includes(player.vocation)) {
      return false;
    }
    return (
      !entry.availability ||
      entry.availability.every(
        (rule) => player.storageValue(rule.key) >= rule.value,
      )
    );
  }

  private itemHasSubtype(item: Item, subtype?: ShopItemSubtype): boolean {
    if (!subtype) return true;
    const key = subtype.kind === "charges" ? "charges" : "fluidType";
    return item.attributes[key] === subtype.value;
  }

  private countCarried(items: ReadonlyArray<Item>): CurrencyBalance {
    const count = (typeId: number) =>
      items
        .filter((item) => item.typeId === typeId)
        .reduce((total, item) => total + item.count, 0);
    return {
      gold: count(GOLD_COIN_TYPE_ID),
      platinum: count(PLATINUM_COIN_TYPE_ID),
      crystal: count(CRYSTAL_COIN_TYPE_ID),
    };
  }

  private currencyProjection(
    player: Player,
    catalog: ShopCatalog,
  ): ShopCurrencyProjection | null {
    const snapshot = this.items.inventorySnapshot(player.id);
    const currencyItemTypeId = catalog.currencyItemTypeId ?? GOLD_COIN_TYPE_ID;
    const type = this.items.itemType(currencyItemTypeId);
    if (
      !snapshot ||
      !type ||
      (catalog.currencyItemTypeId !== undefined && !type.stackable)
    ) {
      return null;
    }
    return {
      currencyItemTypeId,
      currencySpriteId: type.spriteId,
      currencyName: catalog.currencyName ?? "gold",
      currencyAmount: catalog.currencyItemTypeId !== undefined
        ? this.countType(snapshot.items, currencyItemTypeId)
        : countMoneyWorth(this.countCarried(snapshot.items)),
    };
  }

  private countType(items: ReadonlyArray<Item>, typeId: number): number {
    return items
      .filter((item) => item.typeId === typeId)
      .reduce((total, item) => total + item.count, 0);
  }

  private usedWeight(items: ReadonlyArray<Item>): number {
    return items.reduce(
      (total, item) => total + this.itemWeight(item.typeId) * item.count,
      0,
    );
  }

  private itemWeight(typeId: number): number {
    return this.items.itemType(typeId)?.weight ?? 0;
  }

  private npcOwnsShop(npc: Npc, shopId: string): boolean {
    return Boolean(
      npc.type.dialogue?.nodes.some(
        (node) =>
          node.action?.kind === "shop" && node.action.shopId === shopId,
      ),
    );
  }

  private inTalkRange(player: Player, npc: Npc): boolean {
    const range = npc.type.dialogue?.talkRange ?? 0;
    return (
      player.position.z === npc.position.z &&
      Math.max(
        Math.abs(player.position.x - npc.position.x),
        Math.abs(player.position.y - npc.position.y),
      ) <= range
    );
  }

  private fail(session: Session, reason: ShopActionFailedReason): void {
    session.send({ type: "shop-action-failed", reason });
  }
}
