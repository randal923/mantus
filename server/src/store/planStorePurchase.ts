import { MAX_PREMIUM_DAYS, PREY_RULES } from "@tibia/protocol";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { MOUNTS, OUTFITS } from "../outfit/outfitCatalog";
import { XP_BOOST_DURATION_MS } from "./delivery/deliverExpBoost";
import type { StoreCatalogSubOffer } from "./storeCatalog";
import { XP_BOOST_DAILY_LIMIT } from "./storeOfferAvailability";
import type { StorePlayerSnapshot } from "./StorePlayerSnapshot";
import type { StorePurchaseEffect } from "./StorePurchaseEffect";
import type {
  PlannedStorePurchase,
  StorePurchasePersistPlan,
} from "./StorePurchasePlan";
import { planBoundItemDelivery } from "./planBoundItemDelivery";
import { xpBoostPrice } from "./xpBoostPrice";

const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Decides a store purchase entirely from live memory, inside the tick: price
 * (including the XP boost's escalating curve), every availability rule the
 * legacy transaction enforced, and — for item offers — the exact rows and
 * slots the delivery will occupy. The caller applies the outcome to memory
 * and queues the persist plan; the transaction behind re-asserts each rule
 * against locked rows and dies loudly instead of drifting (charter rule 4
 * moves to the persist's assertions; memory stays the single decision point).
 *
 * Name and sex changes are deliberately not planned here: a rename needs the
 * global name-uniqueness answer only the database has.
 */
export function planStorePurchase(input: {
  readonly offer: StoreCatalogSubOffer;
  readonly accountId: string;
  readonly characterId: string;
  readonly requestKey: string;
  readonly balance: number;
  readonly premiumUntil: Date | null;
  readonly snapshot: StorePlayerSnapshot;
  readonly xpBoostUntilMs: number;
  readonly nextLockedPreySlot: number | undefined;
  readonly nextLockedHuntingSlot: number | undefined;
  readonly carriedItems: ReadonlyArray<Item>;
  readonly catalog: ItemCatalog;
  readonly nowMs: number;
}): PlannedStorePurchase {
  const { offer, snapshot, nowMs } = input;
  const grant = offer.grant;
  if (grant.kind === "name-change" || grant.kind === "sex-change") {
    return { status: "failed" };
  }

  const price =
    grant.kind === "exp-boost"
      ? xpBoostPrice(snapshot.xpBoostPurchasesToday)
      : offer.price;
  if (input.balance < price) return { status: "insufficient-coins" };

  const persistBase = {
    accountId: input.accountId,
    characterId: input.characterId,
    offerId: offer.id,
    requestKey: input.requestKey,
    price,
  };
  const planned = (
    delivered: {
      readonly effect: StorePurchaseEffect;
      readonly items?: ReadonlyArray<Item>;
      readonly boundRootItem?: Item;
      readonly persist?: Partial<StorePurchasePersistPlan>;
    },
  ): PlannedStorePurchase => ({
    status: "planned",
    price,
    balanceAfter: input.balance - price,
    premiumUntil: delivered.persist?.premiumUntil ?? input.premiumUntil,
    effect: delivered.effect,
    deliveredItems: delivered.items ?? [],
    ...(delivered.boundRootItem === undefined
      ? {}
      : { boundRootItem: delivered.boundRootItem }),
    persist: {
      ...persistBase,
      premiumUntil: null,
      ...delivered.persist,
    },
  });

  if (grant.kind === "premium") {
    const current = input.premiumUntil?.getTime() ?? 0;
    const next = new Date(Math.max(nowMs, current) + grant.days * DAY_MS);
    if (next.getTime() - nowMs > MAX_PREMIUM_DAYS * DAY_MS) {
      return { status: "premium-limit" };
    }
    return planned({
      effect: { kind: "premium" },
      persist: { premiumUntil: next },
    });
  }

  if (grant.kind === "outfit" || grant.kind === "outfit-addon") {
    const isMale = snapshot.sex === "male";
    const lookType = isMale ? grant.male : grant.female;
    if (OUTFITS.get(lookType)?.sex !== snapshot.sex) {
      return { status: "wrong-sex" };
    }
    const owned = snapshot.outfitAddonsByLookType.get(lookType);
    if (grant.kind === "outfit-addon" && owned === undefined) {
      return { status: "outfit-required" };
    }
    if (owned !== undefined && (grant.addons & ~owned) === 0) {
      return { status: "already-owned" };
    }
    return planned({
      effect: { kind: "outfit", lookType, addons: (owned ?? 0) | grant.addons },
    });
  }

  if (grant.kind === "mount") {
    if (!MOUNTS.has(grant.mountId)) return { status: "offer-not-found" };
    if (snapshot.mountIds.has(grant.mountId)) {
      return { status: "already-owned" };
    }
    return planned({ effect: { kind: "mount", mountId: grant.mountId } });
  }

  if (
    grant.kind === "item" ||
    grant.kind === "stackable" ||
    grant.kind === "charges" ||
    grant.kind === "house-item"
  ) {
    if (
      (grant.kind === "item" || grant.kind === "stackable") &&
      grant.unique &&
      snapshot.uniqueItemTypeIds.has(grant.itemTypeId)
    ) {
      return { status: "already-owned" };
    }
    const delivery = planBoundItemDelivery({
      grant,
      catalog: input.catalog,
      characterId: input.characterId,
      carriedItems: input.carriedItems,
      requestKey: input.requestKey,
    });
    if (delivery.status !== "planned") return { status: delivery.status };
    const first = delivery.items[0];
    if (!first) return { status: "failed" };
    return planned({
      effect: { kind: "inbox-item", item: first },
      items: delivery.items,
      ...(delivery.boundRootItem === undefined
        ? {}
        : { boundRootItem: delivery.boundRootItem }),
      persist: {
        boundDelivery: {
          createBoundRoot: delivery.createBoundRoot,
          boundRootId: delivery.boundRootId,
          rows: delivery.rows,
        },
      },
    });
  }

  if (grant.kind === "prey-wildcard") {
    if (snapshot.wildcards >= PREY_RULES.maxWildcards) {
      return { status: "limit-reached" };
    }
    return planned({
      effect: {
        kind: "prey-wildcard",
        balance: Math.min(
          PREY_RULES.maxWildcards,
          snapshot.wildcards + grant.count,
        ),
      },
    });
  }

  if (grant.kind === "prey-slot" || grant.kind === "hunting-slot") {
    const slot =
      grant.kind === "prey-slot"
        ? input.nextLockedPreySlot
        : input.nextLockedHuntingSlot;
    if (slot === undefined) return { status: "already-owned" };
    return planned({ effect: { kind: grant.kind, slot } });
  }

  if (snapshot.xpBoostPurchasesToday >= XP_BOOST_DAILY_LIMIT) {
    return { status: "limit-reached" };
  }
  return planned({
    effect: {
      kind: "exp-boost",
      untilMs: Math.max(input.xpBoostUntilMs, nowMs) + XP_BOOST_DURATION_MS,
    },
    persist: { xpBoostCountBefore: snapshot.xpBoostPurchasesToday },
  });
}
