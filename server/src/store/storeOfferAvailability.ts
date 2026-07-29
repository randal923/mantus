import { MAX_PREMIUM_DAYS, PREY_RULES } from "@tibia/protocol";
import type {
  StoreCatalogProduct,
  StoreCatalogSubOffer,
} from "./storeCatalog";
import type { StorePlayerSnapshot } from "./StorePlayerSnapshot";

/** Canary caps XP boost purchases per character per day. */
export const XP_BOOST_DAILY_LIMIT = 6;

/**
 * Canary's `canBuyOffer`, server-side. Returns why an offer cannot be bought
 * right now, or `undefined` when it can.
 *
 * This is what greys the button — it is *not* the enforcement. Every reason
 * below is re-derived inside the purchase transaction from freshly locked
 * rows, because the wardrobe, slot, or balance this reads can change between
 * the list being drawn and the buy being clicked (charter rules 4 and 8).
 */
export function storeOfferAvailability(
  product: StoreCatalogProduct,
  offer: StoreCatalogSubOffer,
  snapshot: StorePlayerSnapshot,
): string | undefined {
  const grant = offer.grant;

  if (grant.kind === "premium") {
    return snapshot.premiumDaysRemaining + grant.days > MAX_PREMIUM_DAYS
      ? "You cannot store that much Premium Time."
      : undefined;
  }

  if (grant.kind === "outfit" || grant.kind === "outfit-addon") {
    const lookType = snapshot.sex === "male" ? grant.male : grant.female;
    const owned = snapshot.outfitAddonsByLookType.get(lookType);
    if (grant.kind === "outfit-addon" && owned === undefined) {
      return "You must own the outfit before you can buy its addon.";
    }
    if (owned === undefined) return undefined;
    return (grant.addons & ~owned) === 0
      ? grant.kind === "outfit-addon"
        ? "You already own this addon."
        : "You already own this outfit."
      : undefined;
  }

  if (grant.kind === "mount") {
    return snapshot.mountIds.has(grant.mountId)
      ? "You already own this mount."
      : undefined;
  }

  if (grant.kind === "item" || grant.kind === "stackable") {
    return grant.unique && snapshot.uniqueItemTypeIds.has(grant.itemTypeId)
      ? `You already have a ${product.name}.`
      : undefined;
  }

  if (grant.kind === "prey-wildcard") {
    return snapshot.wildcards >= PREY_RULES.maxWildcards
      ? `You cannot own more than ${PREY_RULES.maxWildcards} prey wildcards.`
      : undefined;
  }

  if (grant.kind === "prey-slot") {
    return snapshot.preySlotsUnlocked
      ? "You already have every prey slot unlocked."
      : undefined;
  }

  if (grant.kind === "hunting-slot") {
    return snapshot.huntingSlotsUnlocked
      ? "You already have every hunting task slot unlocked."
      : undefined;
  }

  if (grant.kind === "exp-boost") {
    if (snapshot.xpBoostActive) return "You already have an active XP boost.";
    return snapshot.xpBoostPurchasesToday >= XP_BOOST_DAILY_LIMIT
      ? "You cannot buy another XP Boost today."
      : undefined;
  }

  return undefined;
}
