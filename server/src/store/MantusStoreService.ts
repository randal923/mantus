import { randomUUID } from "node:crypto";
import {
  STORE_LIMITS,
  type StoreActionFailedReason,
  type StoreCategoryMessage,
  type StoreDescriptionMessage,
  type StoreHistoryMessage,
  type StoreOpenMessage,
  type StorePurchaseMessage,
} from "@tibia/protocol";
import { getAccountStatus } from "../getAccountStatus";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { Account } from "../AccountStore";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import type { MantusStoreStore } from "./MantusStoreStore";
import type { StoreLiveHooks } from "./StoreLiveHooks";
import type { StorePlayerSnapshot } from "./StorePlayerSnapshot";
import type { StorePurchaseEffect } from "./StorePurchaseEffect";
import {
  STORE_CATEGORIES_BY_ID,
  STORE_HOME_PRODUCT_IDS,
  STORE_OFFERS_BY_ID,
  STORE_PRODUCTS_BY_ID,
  storeCategoryTree,
  toStoreProduct,
  type StoreOfferAdjustment,
} from "./storeCatalog";
import { storeOfferAvailability } from "./storeOfferAvailability";
import { xpBoostPrice } from "./xpBoostPrice";
import { ResolvedOutcomes } from "../ResolvedOutcomes";

type StoreIntent =
  | StoreOpenMessage
  | StoreCategoryMessage
  | StoreDescriptionMessage
  | StorePurchaseMessage
  | StoreHistoryMessage;

/** Unique-item products, whose "already owned" check needs a database read. */
const UNIQUE_ITEM_TYPE_IDS: ReadonlyArray<number> = [
  ...new Set(
    [...STORE_OFFERS_BY_ID.values()].flatMap(({ offer }) =>
      (offer.grant.kind === "item" || offer.grant.kind === "stackable") &&
      offer.grant.unique
        ? [offer.grant.itemTypeId]
        : [],
    ),
  ),
];

/**
 * The Mantus Store, shaped like Canary's game store: a category tree, paged
 * product lists, descriptions fetched for the selected product, and purchases
 * that name an offer id and nothing else.
 *
 * The service decides *nothing* about a purchase. It rate-limits, resolves
 * the session's own account and character, and hands an offer id to the
 * store; price, availability and delivery are all re-derived inside that
 * transaction. What comes back is applied to the live world here, in the
 * tick, never from the socket callback (charter rules 3, 4 and 5).
 */
export class MantusStoreService {
  private readonly outcomes = new ResolvedOutcomes<[number]>();
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();
  /** Cached per-character DB facts for the availability display. */
  private readonly factsByCharacter = new Map<
    string,
    { ownedUniqueItemTypeIds: ReadonlySet<number>; xpBoostPurchasesToday: number }
  >();

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly catalog: ItemCatalog,
    private readonly store?: MantusStoreStore,
    private readonly hooks?: StoreLiveHooks,
  ) {}

  /** The sprite and appearance ids for an item product, from the catalog. */
  private itemIconOf = (itemTypeId: number) => {
    const type = this.catalog.require(itemTypeId);
    return { spriteId: type.spriteId, clientId: type.clientId };
  };

  applyResolvedOutcomes(now: number): void {
    this.outcomes.applyAll(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  detach(session: Session): void {
    this.cooldownBySession.delete(session.id);
    session.storeOperationPending = false;
    if (session.playerId) this.factsByCharacter.delete(session.playerId);
  }

  handle(session: Session, intent: StoreIntent, now: number): void {
    const account = session.account;
    const characterId = session.playerId;
    if (!account || !characterId || !this.world.getPlayer(characterId)) {
      session.sendError("join-required");
      return;
    }
    if (intent.type === "store-open") {
      this.open(session, characterId, account);
      return;
    }
    if (intent.type === "store-category") {
      this.sendCategory(session, characterId, account, intent);
      return;
    }
    if (intent.type === "store-description") {
      const product = STORE_PRODUCTS_BY_ID.get(intent.productId);
      if (!product) {
        this.fail(session, "offer-not-found");
        return;
      }
      session.send({
        type: "store-description-state",
        productId: product.id,
        description: product.description,
      });
      return;
    }
    if (intent.type === "store-history") {
      this.sendHistory(session, account.id, characterId, now);
      return;
    }
    this.purchase(session, account.id, characterId, intent, now);
  }

  /**
   * Sends the category tree and the landing page, and refreshes the two
   * per-character facts the availability display needs but memory does not
   * hold. The tree goes out immediately so the window opens without waiting
   * on the database.
   */
  private open(
    session: Session,
    characterId: string,
    account: Account,
  ): void {
    const adjustments = this.adjustmentsFor(characterId, account);
    session.send({
      type: "store-state",
      balance: account.mantusCoins,
      categories: storeCategoryTree(this.itemIconOf),
      home: STORE_HOME_PRODUCT_IDS.flatMap((productId) => {
        const product = STORE_PRODUCTS_BY_ID.get(productId);
        return product
          ? [toStoreProduct(product, adjustments, this.itemIconOf)]
          : [];
      }),
    });

    const store = this.store;
    if (!store) return;
    this.track(
      store.facts(characterId, UNIQUE_ITEM_TYPE_IDS).then(
        (facts) => {
          this.outcomes.push(() => {
            if (this.registry.sessionFor(characterId) !== session) return;
            this.factsByCharacter.set(characterId, {
              ownedUniqueItemTypeIds: new Set(facts.ownedUniqueItemTypeIds),
              xpBoostPurchasesToday: facts.xpBoostPurchasesToday,
            });
          });
        },
        (cause: unknown) => this.warn(characterId, cause),
      ),
    );
  }

  private sendCategory(
    session: Session,
    characterId: string,
    account: Account,
    intent: StoreCategoryMessage,
  ): void {
    const category = STORE_CATEGORIES_BY_ID.get(intent.categoryId);
    if (!category) {
      this.fail(session, "category-not-found");
      return;
    }
    const pageCount = Math.max(
      1,
      Math.ceil(category.products.length / STORE_LIMITS.productsPerPage),
    );
    const page = Math.min(intent.page, pageCount - 1);
    const start = page * STORE_LIMITS.productsPerPage;
    const adjustments = this.adjustmentsFor(characterId, account);
    session.send({
      type: "store-offers",
      categoryId: category.id,
      page,
      pageCount,
      products: category.products
        .slice(start, start + STORE_LIMITS.productsPerPage)
        .map((product) => toStoreProduct(product, adjustments, this.itemIconOf)),
    });
  }

  /**
   * Per-offer display state for this character: why an offer is greyed out,
   * and the XP boost's current escalating price. Recomputed on every list so
   * it always reflects what the player owns right now.
   */
  private adjustmentsFor(
    characterId: string,
    account: Account,
  ): ReadonlyMap<string, StoreOfferAdjustment> {
    const snapshot = this.snapshotFor(characterId, account);
    const adjustments = new Map<string, StoreOfferAdjustment>();
    if (!snapshot) return adjustments;
    for (const { product, offer } of STORE_OFFERS_BY_ID.values()) {
      const disabledReason = storeOfferAvailability(product, offer, snapshot);
      const price =
        offer.grant.kind === "exp-boost"
          ? xpBoostPrice(snapshot.xpBoostPurchasesToday)
          : undefined;
      if (disabledReason === undefined && price === undefined) continue;
      adjustments.set(offer.id, {
        ...(price === undefined ? {} : { price }),
        ...(disabledReason === undefined ? {} : { disabledReason }),
      });
    }
    return adjustments;
  }

  private snapshotFor(
    characterId: string,
    account: Account,
  ): StorePlayerSnapshot | null {
    const player = this.world.getPlayer(characterId);
    const hooks = this.hooks;
    if (!player || !hooks) return null;
    const entitlements = hooks.entitlementsFor(characterId);
    const facts = this.factsByCharacter.get(characterId);
    const status = getAccountStatus(account, Date.now());
    return {
      sex: player.sex,
      outfitAddonsByLookType: new Map(
        entitlements.outfits.map((entry) => [entry.lookType, entry.addons]),
      ),
      mountIds: new Set(entitlements.mounts.map((entry) => entry.mountId)),
      uniqueItemTypeIds: facts?.ownedUniqueItemTypeIds ?? new Set<number>(),
      wildcards: hooks.wildcardsOf(characterId),
      preySlotsUnlocked: hooks.preySlotsUnlocked(characterId),
      huntingSlotsUnlocked: hooks.huntingSlotsUnlocked(characterId),
      xpBoostActive: hooks.xpBoostUntilMs(characterId) > Date.now(),
      xpBoostPurchasesToday: facts?.xpBoostPurchasesToday ?? 0,
      premiumDaysRemaining: status.premiumDaysRemaining,
    };
  }

  private purchase(
    session: Session,
    accountId: string,
    characterId: string,
    intent: StorePurchaseMessage,
    now: number,
  ): void {
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt || session.storeOperationPending) {
      this.fail(session, "rate-limited");
      return;
    }
    const entry = STORE_OFFERS_BY_ID.get(intent.offerId);
    if (!entry) {
      this.fail(session, "offer-not-found");
      return;
    }
    // A name belongs to a name-change purchase and nowhere else; accepting it
    // silently elsewhere would be an unvalidated field riding along.
    const wantsName = entry.offer.grant.kind === "name-change";
    if (wantsName !== (intent.newName !== undefined)) {
      this.fail(session, wantsName ? "name-required" : "offer-not-found");
      return;
    }
    const store = this.store;
    if (!store) {
      this.fail(session, "unavailable");
      return;
    }
    // Canary refuses a temple teleport in combat. Checked here so the player
    // is not charged, and again when the committed outcome is applied.
    if (
      entry.offer.grant.kind === "temple-teleport" &&
      this.hooks?.canTempleTeleport(characterId) === false
    ) {
      this.fail(session, "in-combat");
      return;
    }

    this.cooldownBySession.set(session.id, now + STORE_LIMITS.actionCooldownMs);
    session.storeOperationPending = true;
    this.track(
      store
        .purchase({
          accountId,
          characterId,
          offerId: entry.offer.id,
          requestId: randomUUID(),
          ...(intent.newName === undefined ? {} : { newName: intent.newName }),
        })
        .then(
          (result) => {
            this.outcomes.push((committedAt) => {
              session.storeOperationPending = false;
              if (
                this.registry.sessionFor(characterId) !== session ||
                !session.account
              ) {
                return;
              }
              if (result.status !== "committed") {
                this.fail(session, result.status);
                return;
              }
              session.account = {
                ...session.account,
                mantusCoins: result.balance,
                premiumUntil: result.premiumUntil,
              };
              if (result.premiumUntil) {
                this.world
                  .getPlayer(characterId)
                  ?.setPremiumUntil(result.premiumUntil);
              }
              if (result.effect) {
                this.applyEffect(characterId, result.effect, committedAt);
              }
              for (const item of result.deliveredItems) {
                this.hooks?.injectDelivery(characterId, item);
              }
              // The purchase changed what this character owns, so the greyed
              // -out state the client is showing is now stale.
              this.refreshFacts(session, characterId);
              const status = getAccountStatus(session.account, committedAt);
              session.send({
                type: "store-purchase-completed",
                offerId: entry.offer.id,
                balance: result.balance,
                accountTier: status.accountTier,
                premiumDaysRemaining: status.premiumDaysRemaining,
                ...(result.deliveredItems.length > 0
                  ? { deliveredToInbox: true }
                  : {}),
              });
            });
          },
          (cause: unknown) => {
            this.warn(`purchase for account ${accountId}`, cause);
            this.outcomes.push(() => {
              session.storeOperationPending = false;
              if (this.registry.sessionFor(characterId) === session) {
                this.fail(session, "failed");
              }
            });
          },
        ),
    );
  }

  /** Brings the live world in line with what the purchase already committed. */
  private applyEffect(
    characterId: string,
    effect: StorePurchaseEffect,
    nowMs: number,
  ): void {
    const hooks = this.hooks;
    if (!hooks) return;
    switch (effect.kind) {
      case "outfit":
      case "mount":
        hooks.refreshOutfits(characterId);
        return;
      case "prey-wildcard":
        hooks.applyWildcardBalance(characterId, effect.balance);
        return;
      case "prey-slot":
        hooks.applyPreySlotUnlock(characterId, effect.slot);
        return;
      case "hunting-slot":
        hooks.applyHuntingSlotUnlock(characterId, effect.slot);
        return;
      case "exp-boost":
        hooks.applyXpBoost(characterId, effect.untilMs, nowMs);
        return;
      case "sex-change":
        hooks.applySexChange(characterId, effect.sex, effect.lookType);
        hooks.refreshOutfits(characterId);
        return;
      case "name-change":
        // Canary finalises a rename on relog, and says so in the offer's own
        // description. `Creature.name` is immutable for exactly that reason:
        // the row is renamed, the live creature keeps its name until the
        // next login reads it back.
        return;
      case "temple-teleport":
        // Re-checked at execution time: the fight the buyer was not in when
        // the purchase started may have begun since.
        if (hooks.canTempleTeleport(characterId)) {
          hooks.templeTeleport(characterId);
        }
        return;
      default:
        return;
    }
  }

  private refreshFacts(session: Session, characterId: string): void {
    const store = this.store;
    if (!store) return;
    this.track(
      store.facts(characterId, UNIQUE_ITEM_TYPE_IDS).then(
        (facts) => {
          this.outcomes.push(() => {
            if (this.registry.sessionFor(characterId) !== session) return;
            this.factsByCharacter.set(characterId, {
              ownedUniqueItemTypeIds: new Set(facts.ownedUniqueItemTypeIds),
              xpBoostPurchasesToday: facts.xpBoostPurchasesToday,
            });
          });
        },
        (cause: unknown) => this.warn(characterId, cause),
      ),
    );
  }

  private sendHistory(
    session: Session,
    accountId: string,
    characterId: string,
    now: number,
  ): void {
    const store = this.store;
    if (!store) {
      this.fail(session, "unavailable");
      return;
    }
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt) {
      this.fail(session, "rate-limited");
      return;
    }
    this.cooldownBySession.set(session.id, now + STORE_LIMITS.actionCooldownMs);
    // The account is the session's own, never one named in the message.
    this.track(
      store.history(accountId, STORE_LIMITS.maxHistoryEntries).then(
        (entries) => {
          this.outcomes.push(() => {
            if (
              this.registry.sessionFor(characterId) !== session ||
              !session.account
            ) {
              return;
            }
            session.send({
              type: "store-history-state",
              balance: session.account.mantusCoins,
              entries: [...entries],
            });
          });
        },
        (cause: unknown) => {
          this.warn(`history for account ${accountId}`, cause);
          this.outcomes.push(() => {
            if (this.registry.sessionFor(characterId) === session) {
              this.fail(session, "failed");
            }
          });
        },
      ),
    );
  }

  private fail(session: Session, reason: StoreActionFailedReason): void {
    session.send({ type: "store-action-failed", reason });
  }

  private track(operation: Promise<void>): void {
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }

  private warn(context: string, cause: unknown): void {
    const reason = cause instanceof Error ? cause.message : "unknown";
    console.warn(`store operation failed (${context}): ${reason}`);
  }
}
