import {
  BANK_LIMITS,
  MARKET_LIMITS,
  type MarketAcceptOfferMessage,
  type MarketActionFailedReason,
  type MarketCancelOfferMessage,
  type MarketCreateOfferMessage,
  type MarketItemEntry,
  type MarketOpenMessage,
  type MarketOwnHistoryStateMessage,
  type MarketOwnOffersStateMessage,
} from "@tibia/protocol";
import type { DepotService } from "../depot/DepotService";
import { countCarriedCoins } from "../economy/countCarriedCoins";
import { countMoneyWorth } from "../economy/countMoneyWorth";
import { getAccountStatus } from "../getAccountStatus";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Session } from "../Session";
import { monotonicNow } from "../monotonicNow";
import { marketCategoryOf } from "./marketCategoryOf";
import { marketFeeOf } from "./marketFeeOf";
import { marketTotalOf } from "./marketTotalOf";
import type { MarketIntent } from "./MarketIntent";
import type {
  AcceptOfferResult,
  CancelOfferResult,
  CreateOfferResult,
  MarketFailureStatus,
  MarketOwnHistoryRecord,
  MarketOwnOfferRecord,
  MarketStore,
} from "./MarketStore";
import { pickEscrowSources } from "./pickEscrowSources";
import { sellableDepotCounts } from "./sellableDepotCounts";

const EXPIRY_SCAN_INTERVAL_MS = 60_000;
const EXPIRY_BATCH_LIMIT = 10;

/**
 * Player market (Canary-parity rules on project-native storage, usable from
 * anywhere — a deliberate deviation from Canary's depot-proximity rule).
 * Offers escrow at creation: sell items leave the depot for `market-escrow`
 * rows and buy funds leave the bank into the offer row, always inside one
 * serializable transaction carrying its ledger and audit entries. Mutations
 * ride the per-session pending-item gate so memory-authoritative depot state
 * and the DB stay ordered.
 */
export class MarketService {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();
  private expiryOperation: Promise<void> | null = null;
  private nextExpiryScanAt = 0;

  constructor(
    private readonly items: ItemIntentHandler,
    private readonly catalog: ItemCatalog,
    private readonly depot: DepotService,
    private readonly store?: MarketStore,
  ) {}

  applyResolvedOutcomes(now: number): void {
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  detach(session: Session): void {
    this.cooldownBySession.delete(session.id);
  }

  handle(session: Session, intent: MarketIntent, now: number): void {
    const store = this.store;
    const characterId = session.playerId;
    if (!store || !characterId) {
      this.fail(session, "unavailable");
      return;
    }
    if (intent.type === "market-open") {
      this.open(session, characterId, intent);
      return;
    }
    if (intent.type === "market-browse") {
      this.browse(session, characterId, intent.itemTypeId);
      return;
    }
    if (intent.type === "market-own-offers") {
      this.sendOwnOffers(session, characterId);
      return;
    }
    if (intent.type === "market-own-history") {
      this.sendOwnHistory(session, characterId);
      return;
    }
    if (
      intent.type === "market-create-offer" &&
      (!session.account ||
        getAccountStatus(session.account, now).accountTier !== "premium")
    ) {
      this.fail(session, "premium-required");
      return;
    }
    const gate = this.mutationGate(session, characterId, now);
    if (gate) {
      this.fail(session, gate);
      return;
    }
    this.cooldownBySession.set(
      session.id,
      now + MARKET_LIMITS.actionCooldownMs,
    );
    if (intent.type === "market-create-offer") {
      this.createOffer(session, characterId, intent);
      return;
    }
    if (intent.type === "market-accept-offer") {
      this.acceptOffer(session, characterId, intent);
      return;
    }
    this.cancelOffer(session, characterId, intent);
  }

  tick(now: number): void {
    const store = this.store;
    if (!store || this.expiryOperation || now < this.nextExpiryScanAt) return;
    this.nextExpiryScanAt = now + EXPIRY_SCAN_INTERVAL_MS;
    const operation = store
      .resolveExpired(new Date(now), EXPIRY_BATCH_LIMIT)
      .then((results) => {
        this.outcomes.push(() => {
          for (const result of results) {
            if (result.side !== "sell") continue;
            this.depot.applyExternalCacheEvent(result.characterId, {
              upserts: result.returnedItems,
              bumps: [{ kind: "inbox" }],
            });
          }
        });
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`market expiry scan failed: ${reason}`);
      })
      .finally(() => {
        this.expiryOperation = null;
      });
    this.expiryOperation = operation;
    this.track(operation);
  }

  private open(
    session: Session,
    characterId: string,
    intent: MarketOpenMessage,
  ): void {
    const store = this.store;
    const cache = this.depot.cacheFor(characterId);
    if (!store || !cache) {
      this.fail(session, "failed");
      return;
    }
    const owned = sellableDepotCounts(cache);
    const operation = (async () => {
      // One parallel burst; page 1 also carries own offers and history so an
      // open needs no follow-up round trips from the client.
      const [data, ownOffers, ownHistory] = await Promise.all([
        store.openData(characterId),
        intent.page === 1
          ? store.ownOffers(characterId, MARKET_LIMITS.maxOwnOffers)
          : Promise.resolve(null),
        intent.page === 1
          ? store.ownHistory(characterId, MARKET_LIMITS.maxHistoryEntries)
          : Promise.resolve(null),
      ]);
      const typeIds = new Set<number>(data.offerTypeIds);
      for (const typeId of owned.keys()) typeIds.add(typeId);
      const entries: MarketItemEntry[] = [];
      for (const typeId of typeIds) {
        const type = this.catalog.get(typeId);
        if (!type) continue;
        const category = marketCategoryOf(type);
        if (!category) continue;
        entries.push({
          itemTypeId: type.id,
          clientId: type.clientId,
          spriteId: type.spriteId,
          name: type.name,
          category,
          stackable: type.stackable,
          ownedCount: Math.min(200_000, owned.get(typeId) ?? 0),
          averagePrice: 0,
        });
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      const pageCount = Math.min(
        MARKET_LIMITS.maxItemPages,
        Math.max(1, Math.ceil(entries.length / MARKET_LIMITS.itemPageSize)),
      );
      const page = Math.min(intent.page, pageCount);
      const pageEntries = entries.slice(
        (page - 1) * MARKET_LIMITS.itemPageSize,
        page * MARKET_LIMITS.itemPageSize,
      );
      const averages = await store.averagePrices(
        pageEntries.map((entry) => entry.itemTypeId),
      );
      this.outcomes.push(() => {
        session.send({
          type: "market-opened",
          balance: this.spendableBalance(characterId, data.balance),
          activeOfferCount: Math.min(
            MARKET_LIMITS.maxActiveOffersPerCharacter,
            data.activeOfferCount,
          ),
          page,
          pageCount,
          items: pageEntries.map((entry) => ({
            ...entry,
            averagePrice: Math.min(
              MARKET_LIMITS.maxUnitPrice,
              averages.get(entry.itemTypeId) ?? 0,
            ),
          })),
        });
        if (ownOffers) session.send(this.projectOwnOffers(ownOffers));
        if (ownHistory) session.send(this.projectOwnHistory(ownHistory));
      });
    })().catch((cause: unknown) => {
      this.warn(characterId, cause);
      this.outcomes.push(() => this.fail(session, "failed"));
    });
    this.track(operation);
  }

  private browse(
    session: Session,
    characterId: string,
    itemTypeId: number,
  ): void {
    const store = this.store;
    if (!store) return;
    const operation = store
      .offersForType(itemTypeId, MARKET_LIMITS.maxOffersPerSide)
      .then((offers) => {
        this.outcomes.push(() => {
          session.send({
            type: "market-offers",
            itemTypeId,
            offers: offers.map((offer) => ({
              offerId: offer.id,
              side: offer.side,
              amount: offer.remainingAmount,
              unitPrice: offer.unitPrice,
              expiresAt: offer.expiresAt.toISOString(),
              mine: offer.characterId === characterId,
            })),
          });
        });
      })
      .catch((cause: unknown) => {
        this.warn(characterId, cause);
        this.outcomes.push(() => this.fail(session, "failed"));
      });
    this.track(operation);
  }

  private sendOwnOffers(session: Session, characterId: string): void {
    const store = this.store;
    if (!store) return;
    const operation = store
      .ownOffers(characterId, MARKET_LIMITS.maxOwnOffers)
      .then((records) => {
        this.outcomes.push(() => session.send(this.projectOwnOffers(records)));
      })
      .catch((cause: unknown) => {
        this.warn(characterId, cause);
        this.outcomes.push(() => this.fail(session, "failed"));
      });
    this.track(operation);
  }

  private sendOwnHistory(session: Session, characterId: string): void {
    const store = this.store;
    if (!store) return;
    const operation = store
      .ownHistory(characterId, MARKET_LIMITS.maxHistoryEntries)
      .then((records) => {
        this.outcomes.push(() => session.send(this.projectOwnHistory(records)));
      })
      .catch((cause: unknown) => {
        this.warn(characterId, cause);
        this.outcomes.push(() => this.fail(session, "failed"));
      });
    this.track(operation);
  }

  private projectOwnOffers(
    records: ReadonlyArray<MarketOwnOfferRecord>,
  ): MarketOwnOffersStateMessage {
    return {
      type: "market-own-offers-state",
      offers: records.flatMap((record) => {
        const type = this.catalog.get(record.itemTypeId);
        if (!type) return [];
        return [
          {
            offerId: record.id,
            side: record.side,
            itemTypeId: record.itemTypeId,
            spriteId: type.spriteId,
            name: type.name,
            amount: record.remainingAmount,
            unitPrice: record.unitPrice,
            expiresAt: record.expiresAt.toISOString(),
          },
        ];
      }),
    };
  }

  private projectOwnHistory(
    records: ReadonlyArray<MarketOwnHistoryRecord>,
  ): MarketOwnHistoryStateMessage {
    return {
      type: "market-own-history-state",
      entries: records.flatMap((record) => {
        const type = this.catalog.get(record.itemTypeId);
        if (!type) return [];
        return [
          {
            side: record.side,
            itemTypeId: record.itemTypeId,
            spriteId: type.spriteId,
            name: type.name,
            amount: record.amount,
            unitPrice: record.unitPrice,
            state: record.state,
            occurredAt: record.occurredAt.toISOString(),
          },
        ];
      }),
    };
  }

  private createOffer(
    session: Session,
    characterId: string,
    intent: MarketCreateOfferMessage,
  ): void {
    const store = this.store;
    if (!store) return;
    const type = this.catalog.get(intent.itemTypeId);
    if (!type || marketCategoryOf(type) === null) {
      this.fail(session, "not-marketable");
      return;
    }
    const amountCap = type.stackable
      ? MARKET_LIMITS.maxAmountStackable
      : MARKET_LIMITS.maxAmountNonStackable;
    if (intent.amount > amountCap) {
      this.fail(session, "amount-too-large");
      return;
    }
    const totalPrice = marketTotalOf(intent.amount, intent.unitPrice);
    if (totalPrice === null) {
      this.fail(session, "price-limit");
      return;
    }
    const fee = marketFeeOf(totalPrice);
    const base = {
      requestId: intent.requestId,
      characterId,
      itemTypeId: intent.itemTypeId,
      amount: intent.amount,
      unitPrice: intent.unitPrice,
      totalPrice,
      fee,
    };
    let commit: () => Promise<CreateOfferResult>;
    if (intent.side === "sell") {
      const cache = this.depot.cacheFor(characterId);
      const sources = cache
        ? pickEscrowSources(cache, intent.itemTypeId, intent.amount)
        : null;
      if (!sources) {
        this.fail(session, "insufficient-items");
        return;
      }
      commit = () => store.createSellOffer({ ...base, sources });
    } else {
      commit = () => store.createBuyOffer(base);
    }
    session.itemOperationPending = true;
    const operation = commit().then(
      (result) => {
        this.outcomes.push((at) => {
          session.itemOperationPending = false;
          if (result.status !== "committed") {
            this.fail(session, this.reasonOf(result.status));
            return;
          }
          if (result.mutation) {
            this.items.applyCommittedMutation(
              session,
              characterId,
              result.mutation,
              at,
            );
          }
          if (intent.side === "sell") {
            this.depot.applyCacheEvent(characterId, {
              upserts: result.depotUpserts,
              removedItemIds: result.removedItemIds,
              bumps: result.sourceDepotIds.map((depotId) => ({
                kind: "depot" as const,
                depotId,
              })),
            });
          }
          session.send({
            type: "market-transacted",
            requestId: intent.requestId,
            kind: "created",
            offerId: result.offerId,
            side: intent.side,
            itemTypeId: intent.itemTypeId,
            amount: intent.amount,
            totalPrice,
            fee,
            balance: this.spendableBalance(characterId, result.balance),
          });
        });
      },
      (cause: unknown) => {
        this.warn(characterId, cause);
        this.outcomes.push(() => {
          session.itemOperationPending = false;
          this.fail(session, "failed");
        });
      },
    );
    this.track(operation);
    this.items.trackExternalOperation(characterId, operation);
  }

  private acceptOffer(
    session: Session,
    characterId: string,
    intent: MarketAcceptOfferMessage,
  ): void {
    const store = this.store;
    if (!store) return;
    session.itemOperationPending = true;
    const lookup = store.offerById(intent.offerId).then(
      (offer) => {
        this.outcomes.push(() => {
          if (!offer || offer.expiresAt.getTime() <= monotonicNow()) {
            session.itemOperationPending = false;
            this.fail(session, "offer-not-found");
            return;
          }
          if (intent.amount > offer.remainingAmount) {
            session.itemOperationPending = false;
            this.fail(session, "amount-too-large");
            return;
          }
          // Re-check the session identity; the lookup crossed a tick.
          if (session.playerId !== characterId) {
            session.itemOperationPending = false;
            this.fail(session, "failed");
            return;
          }
          if (offer.side === "sell") {
            this.commitAccept(session, characterId, intent, () =>
              store.acceptSellOffer({
                requestId: intent.requestId,
                offerId: intent.offerId,
                buyerCharacterId: characterId,
                amount: intent.amount,
              }),
            );
            return;
          }
          const cache = this.depot.cacheFor(characterId);
          const sources = cache
            ? pickEscrowSources(cache, offer.itemTypeId, intent.amount)
            : null;
          if (!sources) {
            session.itemOperationPending = false;
            this.fail(session, "insufficient-items");
            return;
          }
          this.commitAccept(session, characterId, intent, () =>
            store.acceptBuyOffer({
              requestId: intent.requestId,
              offerId: intent.offerId,
              sellerCharacterId: characterId,
              amount: intent.amount,
              sources,
            }),
          );
        });
      },
      (cause: unknown) => {
        this.warn(characterId, cause);
        this.outcomes.push(() => {
          session.itemOperationPending = false;
          this.fail(session, "failed");
        });
      },
    );
    this.track(lookup);
  }

  private commitAccept(
    session: Session,
    characterId: string,
    intent: MarketAcceptOfferMessage,
    commit: () => Promise<AcceptOfferResult>,
  ): void {
    const operation = commit().then(
      (result) => {
        this.outcomes.push((at) => {
          session.itemOperationPending = false;
          if (result.status !== "committed") {
            this.fail(session, this.reasonOf(result.status));
            return;
          }
          if (result.mutation) {
            this.items.applyCommittedMutation(
              session,
              characterId,
              result.mutation,
              at,
            );
          }
          this.depot.applyExternalCacheEvent(result.deliveredCharacterId, {
            upserts: result.deliveredItems,
            bumps: [{ kind: "inbox" }],
          });
          if (result.removedItemIds.length > 0 || result.depotUpserts.length > 0) {
            this.depot.applyCacheEvent(characterId, {
              upserts: result.depotUpserts,
              removedItemIds: result.removedItemIds,
              bumps: result.sourceDepotIds.map((depotId) => ({
                kind: "depot" as const,
                depotId,
              })),
            });
          }
          const side = result.deliveredCharacterId === characterId ? "buy" : "sell";
          session.send({
            type: "market-transacted",
            requestId: intent.requestId,
            kind: "accepted",
            offerId: result.offerId,
            side,
            itemTypeId: result.itemTypeId,
            amount: result.amount,
            totalPrice: result.totalPrice,
            fee: 0,
            balance: this.spendableBalance(characterId, result.balance),
          });
        });
      },
      (cause: unknown) => {
        this.warn(characterId, cause);
        this.outcomes.push(() => {
          session.itemOperationPending = false;
          this.fail(session, "failed");
        });
      },
    );
    this.track(operation);
    this.items.trackExternalOperation(characterId, operation);
  }

  private cancelOffer(
    session: Session,
    characterId: string,
    intent: MarketCancelOfferMessage,
  ): void {
    const store = this.store;
    if (!store) return;
    session.itemOperationPending = true;
    const operation = store
      .cancelOffer({
        requestId: intent.requestId,
        offerId: intent.offerId,
        characterId,
      })
      .then(
        (result: CancelOfferResult) => {
          this.outcomes.push(() => {
            session.itemOperationPending = false;
            if (result.status !== "committed") {
              this.fail(session, this.reasonOf(result.status));
              return;
            }
            if (result.returnedItems.length > 0) {
              this.depot.applyExternalCacheEvent(characterId, {
                upserts: result.returnedItems,
                bumps: [{ kind: "inbox" }],
              });
            }
            session.send({
              type: "market-transacted",
              requestId: intent.requestId,
              kind: "cancelled",
              offerId: result.offerId,
              side: result.side,
              itemTypeId: result.itemTypeId,
              amount: result.remainingAmount,
              totalPrice: result.refund,
              fee: 0,
              balance: this.spendableBalance(characterId, result.balance),
            });
          });
        },
        (cause: unknown) => {
          this.warn(characterId, cause);
          this.outcomes.push(() => {
            session.itemOperationPending = false;
            this.fail(session, "failed");
          });
        },
      );
    this.track(operation);
    this.items.trackExternalOperation(characterId, operation);
  }

  private mutationGate(
    session: Session,
    characterId: string,
    now: number,
  ): MarketActionFailedReason | null {
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt) return "cooldown";
    if (this.items.isPersistPoisoned(characterId)) return "failed";
    if (
      session.itemOperationPending ||
      session.depotOperationPending ||
      session.itemPersistsPending > 0 ||
      session.travelOperationPending
    ) {
      return "busy";
    }
    return null;
  }

  /**
   * The gold a character can spend on the market right now: bank balance
   * plus carried coins, read after any committed mutation was applied.
   */
  private spendableBalance(characterId: string, bankBalance: number): number {
    const snapshot = this.items.inventorySnapshot(characterId);
    const carried = snapshot
      ? countMoneyWorth(countCarriedCoins(snapshot.items))
      : 0;
    return Math.min(BANK_LIMITS.maxBalance, bankBalance + carried);
  }

  private reasonOf(status: MarketFailureStatus): MarketActionFailedReason {
    return status;
  }

  private fail(session: Session, reason: MarketActionFailedReason): void {
    session.send({ type: "market-action-failed", reason });
  }

  private track(operation: Promise<void>): void {
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }

  private warn(characterId: string, cause: unknown): void {
    const reason = cause instanceof Error ? cause.message : "unknown";
    console.warn(
      `market operation failed for character ${characterId}: ${reason}`,
    );
  }
}
