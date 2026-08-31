import { LANGUAGES, STORE_LIMITS } from "@tibia/protocol";
import { DECORATION_KIT_ITEM_ID } from "../item/decorationKitItemId";
import type { ItemCatalog } from "../item/ItemCatalog";
import { MOUNTS, OUTFITS } from "../outfit/outfitCatalog";
import {
  STORE_CATEGORIES,
  STORE_HOME_PRODUCT_IDS,
  STORE_OFFERS_BY_ID,
  STORE_PRODUCTS_BY_ID,
  type StoreGrant,
} from "./storeCatalog";

/**
 * Boot-time gate on the pinned store catalog. Until this existed a bad offer
 * failed on some player's first purchase — after the coin debit had already
 * been planned — rather than at startup. Everything a purchase will need is
 * checked here instead: the item exists and can be carried, the look type
 * exists for both sexes, the mount exists, ids are unique, and no category
 * page can exceed the message budget.
 *
 * Throwing here refuses to start the server, which is the point: a catalog
 * the store cannot deliver is a configuration error, not a runtime condition.
 */
export function assertStoreCatalog(catalog: ItemCatalog): void {
  const seenCategories = new Set<string>();
  const seenProducts = new Set<string>();
  const seenOffers = new Set<string>();

  if (STORE_CATEGORIES.length > STORE_LIMITS.maxCategories) {
    throw new Error(
      `store catalog has ${STORE_CATEGORIES.length} categories, over the ` +
        `${STORE_LIMITS.maxCategories} the protocol allows`,
    );
  }

  for (const category of STORE_CATEGORIES) {
    if (seenCategories.has(category.id)) {
      throw new Error(`duplicate store category id ${category.id}`);
    }
    seenCategories.add(category.id);
    if (
      category.parentId !== null &&
      !STORE_CATEGORIES.some((other) => other.id === category.parentId)
    ) {
      throw new Error(
        `store category ${category.id} names unknown parent ${category.parentId}`,
      );
    }
    const pages = Math.ceil(
      category.products.length / STORE_LIMITS.productsPerPage,
    );
    if (pages > STORE_LIMITS.maxPages) {
      throw new Error(
        `store category ${category.id} needs ${pages} pages, over the ` +
          `${STORE_LIMITS.maxPages} the protocol allows`,
      );
    }

    for (const product of category.products) {
      if (seenProducts.has(product.id)) {
        throw new Error(`duplicate store product id ${product.id}`);
      }
      seenProducts.add(product.id);
      for (const language of LANGUAGES) {
        const description = product.description[language];
        if (
          typeof description !== "string" ||
          description.length > STORE_LIMITS.maxDescriptionLength
        ) {
          throw new Error(
            `store product ${product.id} has a missing or oversized ${language} description`,
          );
        }
        if (typeof category.name[language] !== "string") {
          throw new Error(`store category ${category.id} has no ${language} name`);
        }
      }
      if (
        product.subOffers.length < 1 ||
        product.subOffers.length > STORE_LIMITS.maxSubOffersPerProduct
      ) {
        throw new Error(
          `store product ${product.id} has ${product.subOffers.length} offers`,
        );
      }
      for (const offer of product.subOffers) {
        if (seenOffers.has(offer.id)) {
          throw new Error(`duplicate store offer id ${offer.id}`);
        }
        seenOffers.add(offer.id);
        if (
          !Number.isSafeInteger(offer.price) ||
          offer.price < 1 ||
          offer.price > STORE_LIMITS.maxBalance
        ) {
          throw new Error(`store offer ${offer.id} has an invalid price`);
        }
        if (offer.grant.kind !== product.kind) {
          throw new Error(
            `store offer ${offer.id} grants ${offer.grant.kind} inside a ` +
              `${product.kind} product`,
          );
        }
        assertGrant(offer.id, offer.grant, catalog);
      }
    }
  }

  for (const productId of STORE_HOME_PRODUCT_IDS) {
    if (!STORE_PRODUCTS_BY_ID.has(productId)) {
      throw new Error(`store home page names unknown product ${productId}`);
    }
  }
  if (STORE_HOME_PRODUCT_IDS.length > STORE_LIMITS.maxHomeProducts) {
    throw new Error("store home page has too many products");
  }
  if (STORE_OFFERS_BY_ID.size !== seenOffers.size) {
    throw new Error("store offer index disagrees with the catalog");
  }
}

function assertGrant(
  offerId: string,
  grant: StoreGrant,
  catalog: ItemCatalog,
): void {
  if (grant.kind === "premium") {
    if (!Number.isInteger(grant.days) || grant.days < 1 || grant.days > 365) {
      throw new Error(`store offer ${offerId} grants an invalid premium span`);
    }
    return;
  }

  if (grant.kind === "outfit" || grant.kind === "outfit-addon") {
    const male = OUTFITS.get(grant.male);
    const female = OUTFITS.get(grant.female);
    if (male?.sex !== "male" || female?.sex !== "female") {
      throw new Error(
        `store offer ${offerId} names look types ${grant.male}/${grant.female} ` +
          "that are not a male/female pair in the outfit catalog",
      );
    }
    if (!Number.isInteger(grant.addons) || grant.addons < 0 || grant.addons > 3) {
      throw new Error(`store offer ${offerId} grants invalid addon bits`);
    }
    // An addon bit the sprite pack cannot draw would leave the client unable
    // to render an outfit the server considers legal.
    const drawable = Math.min(male.addons, female.addons) >= 2 ? 3 : 1;
    if ((grant.addons & ~drawable) !== 0) {
      throw new Error(
        `store offer ${offerId} grants addon bits the sprite pack cannot draw`,
      );
    }
    if (grant.kind === "outfit-addon" && grant.addons === 0) {
      throw new Error(`store offer ${offerId} is an addon offer granting no addon`);
    }
    return;
  }

  if (grant.kind === "mount") {
    if (!MOUNTS.has(grant.mountId)) {
      throw new Error(
        `store offer ${offerId} names mount ${grant.mountId}, which is not in ` +
          "the mount catalog",
      );
    }
    return;
  }

  if (grant.kind === "item" || grant.kind === "stackable") {
    const type = catalog.get(grant.itemTypeId);
    if (!type) {
      throw new Error(
        `store offer ${offerId} names item ${grant.itemTypeId}, which is not ` +
          "in the item catalog",
      );
    }
    if (!type.pickupable) {
      throw new Error(
        `store offer ${offerId} names item ${grant.itemTypeId}, which cannot ` +
          "be picked up",
      );
    }
    if (!Number.isInteger(grant.count) || grant.count < 1) {
      throw new Error(`store offer ${offerId} grants an invalid count`);
    }
    if (grant.kind === "stackable" && type.maxCount <= 1) {
      throw new Error(
        `store offer ${offerId} sells item ${grant.itemTypeId} as stackable, ` +
          "but it does not stack",
      );
    }
    if (grant.kind === "item" && grant.count !== 1) {
      throw new Error(`store offer ${offerId} sells a non-stackable in bulk`);
    }
    return;
  }

  if (grant.kind === "charges") {
    const type = catalog.get(grant.itemTypeId);
    if (!type?.pickupable) {
      throw new Error(
        `store offer ${offerId} names item ${grant.itemTypeId}, which is not ` +
          "a carriable catalog item",
      );
    }
    if (!Number.isInteger(grant.charges) || grant.charges < 1) {
      throw new Error(`store offer ${offerId} grants an invalid charge count`);
    }
    return;
  }

  if (grant.kind === "house-item") {
    // The furniture itself is never carried — the buyer receives decoration
    // kits — so the target only has to exist; the kit must be carriable.
    if (!catalog.get(grant.itemTypeId)) {
      throw new Error(
        `store offer ${offerId} names item ${grant.itemTypeId}, which is not ` +
          "in the item catalog",
      );
    }
    if (!catalog.get(DECORATION_KIT_ITEM_ID)?.pickupable) {
      throw new Error(
        "the decoration kit item is missing from the catalog or not carriable",
      );
    }
    if (!Number.isInteger(grant.count) || grant.count < 1 || grant.count > 25) {
      throw new Error(`store offer ${offerId} grants an invalid kit count`);
    }
    return;
  }

  if (grant.kind === "prey-wildcard") {
    if (!Number.isInteger(grant.count) || grant.count < 1) {
      throw new Error(`store offer ${offerId} grants an invalid wildcard count`);
    }
  }
}
