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
import { localDayKey } from "../boosted/localDayKey";
import { getAccountStatus } from "../getAccountStatus";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Account } from "../AccountStore";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import type { MantusStoreStore } from "./MantusStoreStore";
import type { StoreLiveHooks } from "./StoreLiveHooks";
import type { StorePlayerSnapshot } from "./StorePlayerSnapshot";
import type { StorePurchaseEffect } from "./StorePurchaseEffect";
import { planStorePurchase } from "./planStorePurchase";
import {
  STORE_CATEGORIES_BY_ID,
  STORE_HOME_PRODUCT_IDS,
  STORE_OFFERS_BY_ID,
  STORE_PRODUCTS_BY_ID,
  storeCategoryTree,
  toStoreProduct,
  type StoreCatalogProduct,
  type StoreCatalogSubOffer,
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

interface StoreCharacterFacts {
  readonly ownedUniqueItemTypeIds: ReadonlySet<number>;
  /** The local day the XP boost counter belongs to; stale days count zero. */
  readonly xpBoostDay: string;
  readonly xpBoostCount: number;
}

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
 * Purchases are memory-first, the same shape as the NPC shop: the tick
 * decides price, availability and delivery from live caches, applies the
 * outcome, answers the player immediately, and queues one transaction on the
 * item persist lane to make it durable. The transaction re-asserts every rule
 * against locked rows; if it refuses what memory approved, the character is
 * poisoned and resynced rather than left to drift (charter rules 2, 3 and 4).
 *
 * Name and sex changes still run the legacy database-first purchase — a
 * rename needs the global name-uniqueness answer only the database has — as
 * does any purchase raced in before this character's store facts have loaded.
 */
export class MantusStoreService {
  private readonly outcomes = new ResolvedOutcomes<[number]>();
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();
  /** Per-character store facts, seeded from the DB and then tick-owned. */
  private readonly factsByCharacter = new Map<string, StoreCharacterFacts>();
  /** Characters whose facts load is already in flight, so opens do not pile. */
  private readonly factsLoading = new Set<string>();

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly catalog: ItemCatalog,
    private readonly store?: MantusStoreStore,
    private readonly hooks?: StoreLiveHooks,
    private readonly items?: ItemIntentHandler,
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
    if (session.playerId) {
      this.factsByCharacter.delete(session.playerId);
      this.factsLoading.delete(session.playerId);
    }
  }

  handle(session: Session, intent: StoreIntent, now: number): void {
    const account = session.account;
    const characterId = session.playerId;
    if (!account || !characterId || !this.world.getPlayer(characterId)) {
      session.sendError("join-required");
      return;
    }
    if (intent.type === "store-open") {
      this.open(session, characterId, account, now);
      return;
    }
    if (intent.type === "store-category") {
      this.sendCategory(session, characterId, account, intent, now);
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
        description: product.description[account.language],
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
   * Sends the category tree and the landing page. The first open also seeds
   * the per-character facts memory does not hold (owned unique items, the XP
   * boost day counter); once seeded, the tick owns them and no further
   * database read is needed for the rest of the session.
   */
  private open(
    session: Session,
    characterId: string,
    account: Account,
    now: number,
  ): void {
    const adjustments = this.adjustmentsFor(characterId, account, now);
    session.send({
      type: "store-state",
      balance: account.mantusCoins,
      categories: storeCategoryTree(this.itemIconOf, account.language),
      home: STORE_HOME_PRODUCT_IDS.flatMap((productId) => {
        const product = STORE_PRODUCTS_BY_ID.get(productId);
        return product
          ? [
              toStoreProduct(
                product,
                adjustments,
                this.itemIconOf,
                account.language,
              ),
            ]
          : [];
      }),
    });
    this.loadFacts(session, characterId, now);
  }

  private loadFacts(
    session: Session,
    characterId: string,
    now: number,
  ): void {
    const store = this.store;
    if (
      !store ||
      this.factsByCharacter.has(characterId) ||
      this.factsLoading.has(characterId)
    ) {
      return;
    }
    this.factsLoading.add(characterId);
    this.track(
      store.facts(characterId, UNIQUE_ITEM_TYPE_IDS).then(
        (facts) => {
          this.outcomes.push(() => {
            this.factsLoading.delete(characterId);
            if (this.registry.sessionFor(characterId) !== session) return;
            // The tick may have taken ownership while the read was in
            // flight (a fallback purchase committed); never clobber it.
            if (this.factsByCharacter.has(characterId)) return;
            this.factsByCharacter.set(characterId, {
              ownedUniqueItemTypeIds: new Set(facts.ownedUniqueItemTypeIds),
              xpBoostDay: localDayKey(now),
              xpBoostCount: facts.xpBoostPurchasesToday,
            });
          });
        },
        (cause: unknown) => {
          this.factsLoading.delete(characterId);
          this.warn(characterId, cause);
        },
      ),
    );
  }

  private sendCategory(
    session: Session,
    characterId: string,
    account: Account,
    intent: StoreCategoryMessage,
    now: number,
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
    const adjustments = this.adjustmentsFor(characterId, account, now);
    session.send({
      type: "store-offers",
      categoryId: category.id,
      page,
      pageCount,
      products: category.products
        .slice(start, start + STORE_LIMITS.productsPerPage)
        .map((product) =>
          toStoreProduct(
            product,
            adjustments,
            this.itemIconOf,
            account.language,
          ),
        ),
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
    now: number,
  ): ReadonlyMap<string, StoreOfferAdjustment> {
    const snapshot = this.snapshotFor(characterId, account, now);
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
    now: number,
  ): StorePlayerSnapshot | null {
    const player = this.world.getPlayer(characterId);
    const hooks = this.hooks;
    if (!player || !hooks) return null;
    const entitlements = hooks.entitlementsFor(characterId);
    const facts = this.factsByCharacter.get(characterId);
    const status = getAccountStatus(account, now);
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
      xpBoostActive: hooks.xpBoostUntilMs(characterId) > now,
      xpBoostPurchasesToday: this.xpBoostPurchasesToday(facts, now),
      premiumDaysRemaining: status.premiumDaysRemaining,
    };
  }

  private xpBoostPurchasesToday(
    facts: StoreCharacterFacts | undefined,
    now: number,
  ): number {
    if (!facts) return 0;
    return facts.xpBoostDay === localDayKey(now) ? facts.xpBoostCount : 0;
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

    const grantKind = entry.offer.grant.kind;
    const facts = this.factsByCharacter.get(characterId);
    const hooks = this.hooks;
    const items = this.items;
    const player = this.world.getPlayer(characterId);
    const inventory = items?.inventorySnapshot(characterId);
    const account = session.account;
    const snapshot = account
      ? this.snapshotFor(characterId, account, now)
      : null;
    if (
      grantKind === "name-change" ||
      grantKind === "sex-change" ||
      !account ||
      !facts ||
      !hooks ||
      !items ||
      !player ||
      !inventory ||
      !snapshot
    ) {
      this.legacyPurchase(session, accountId, characterId, entry, intent);
      return;
    }

    const requestKey = `store-purchase:${accountId}:${randomUUID()}`;
    const planned = planStorePurchase({
      offer: entry.offer,
      accountId,
      characterId,
      requestKey,
      balance: account.mantusCoins,
      premiumUntil: account.premiumUntil,
      snapshot,
      xpBoostUntilMs: hooks.xpBoostUntilMs(characterId),
      nextLockedPreySlot: hooks.nextLockedPreySlot(characterId),
      nextLockedHuntingSlot: hooks.nextLockedHuntingSlot(characterId),
      carriedItems: inventory.items,
      catalog: this.catalog,
      nowMs: now,
    });
    if (planned.status !== "planned") {
      this.fail(session, planned.status);
      return;
    }

    // Applied synchronously, inside the tick (charter rule 3): balance,
    // premium, live effect and delivered items all change together, before
    // anything else can read them.
    session.account = {
      ...account,
      mantusCoins: planned.balanceAfter,
      ...(planned.persist.premiumUntil === null
        ? {}
        : { premiumUntil: planned.persist.premiumUntil }),
    };
    if (planned.persist.premiumUntil !== null) {
      player.setPremiumUntil(planned.persist.premiumUntil);
    }
    if (planned.boundRootItem) {
      items.applyCommittedMutation(
        session,
        characterId,
        { after: [planned.boundRootItem] },
        now,
      );
    }
    this.applyEffect(characterId, planned.effect, now);
    for (const item of planned.deliveredItems) {
      hooks.injectDelivery(characterId, item, now);
    }
    this.applyFactsAfterPurchase(characterId, facts, entry.offer, now);

    const status = getAccountStatus(session.account, now);
    session.send({
      type: "store-purchase-completed",
      offerId: entry.offer.id,
      balance: planned.balanceAfter,
      accountTier: status.accountTier,
      premiumDaysRemaining: status.premiumDaysRemaining,
      ...(planned.deliveredItems.length > 0 ? { deliveredToBound: true } : {}),
    });

    // The durable leg rides the item persist lane: strictly ordered behind
    // every earlier mutation, retried on serialization conflicts, and — if it
    // still fails — the character is poisoned and this session resynced from
    // committed state, which discards the memory the persist never backed.
    items.enqueuePersist(
      session,
      characterId,
      () => store.persistPurchase(planned.persist),
      () => {
        console.error(
          `store purchase persist dropped for ${characterId}; disconnecting for resync`,
        );
        session.terminate();
      },
    );
  }

  /**
   * The database-first purchase: one SERIALIZABLE transaction decides and
   * delivers everything, and the tick applies the committed outcome. Kept for
   * the offers whose decision needs the database (name and sex changes) and
   * as the fallback while this character's store facts are still loading.
   */
  private legacyPurchase(
    session: Session,
    accountId: string,
    characterId: string,
    entry: { product: StoreCatalogProduct; offer: StoreCatalogSubOffer },
    intent: StorePurchaseMessage,
  ): void {
    const store = this.store;
    if (!store) {
      this.fail(session, "unavailable");
      return;
    }
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
              // Applied relatively: memory-first persists queued behind this
              // transaction are not in its balance, so adopting the absolute
              // number would resurrect coins the tick already spent.
              const premiumUntil = latestOf(
                session.account.premiumUntil,
                result.premiumUntil,
              );
              session.account = {
                ...session.account,
                mantusCoins: session.account.mantusCoins - result.price,
                premiumUntil,
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
                this.hooks?.injectDelivery(characterId, item, committedAt);
              }
              const status = getAccountStatus(session.account, committedAt);
              session.send({
                type: "store-purchase-completed",
                offerId: entry.offer.id,
                balance: session.account.mantusCoins,
                accountTier: status.accountTier,
                premiumDaysRemaining: status.premiumDaysRemaining,
                ...(result.deliveredItems.length > 0
                  ? { deliveredToBound: true }
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

  /** Brings the tick-owned facts in line with the purchase it just applied. */
  private applyFactsAfterPurchase(
    characterId: string,
    facts: StoreCharacterFacts,
    offer: StoreCatalogSubOffer,
    now: number,
  ): void {
    const grant = offer.grant;
    if (
      (grant.kind === "item" || grant.kind === "stackable") &&
      grant.unique
    ) {
      this.factsByCharacter.set(characterId, {
        ...facts,
        ownedUniqueItemTypeIds: new Set([
          ...facts.ownedUniqueItemTypeIds,
          grant.itemTypeId,
        ]),
      });
      return;
    }
    if (grant.kind === "exp-boost") {
      this.factsByCharacter.set(characterId, {
        ...facts,
        xpBoostDay: localDayKey(now),
        xpBoostCount: this.xpBoostPurchasesToday(facts, now) + 1,
      });
    }
  }

  /** Brings the live world in line with what the purchase decided. */
  private applyEffect(
    characterId: string,
    effect: StorePurchaseEffect,
    nowMs: number,
  ): void {
    const hooks = this.hooks;
    if (!hooks) return;
    switch (effect.kind) {
      case "outfit":
        hooks.applyOutfitGrant(characterId, effect.lookType, effect.addons);
        return;
      case "mount":
        hooks.applyMountGrant(characterId, effect.mountId);
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

/** The later of two premium deadlines; a queued extension is never undone. */
function latestOf(current: Date | null, incoming: Date | null): Date | null {
  if (!incoming) return current;
  if (!current) return incoming;
  return incoming.getTime() >= current.getTime() ? incoming : current;
}
