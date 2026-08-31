// Generates server/src/store/storeCatalogData.ts from Canary's pinned
// data/modules/scripts/gamestore/catalog/*.lua.
//
// The catalog is the outer bound on what the store can ever sell, so an offer
// only survives import if this server can actually *deliver* it: its item id
// must exist in the pinned item catalog and be pickupable, its look type must
// exist in the outfit catalog for both sexes, its mount id must exist in the
// mount catalog. Anything else is dropped and reported, so a bad entry fails
// at import time rather than on some player's first purchase.
//
// Offer types whose systems this server does not have — blessings, hirelings,
// charm expansion, instant reward access, beds, casks, tournament — are
// skipped by design and listed in the run's summary. House furniture and
// upgrades (exercise dummies, shrines, mailboxes) ARE supported: they deliver
// as decoration kits that unwrap on an owned house tile.
//
// Usage: node tools/importCanaryStoreCatalog.mjs [path-to-canary]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  constantName,
  parseCanaryStoreCatalogModule,
} from "./parseCanaryStoreCatalog.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const canaryRoot = process.argv[2] ?? join(here, "../../canary");
const catalogRoot = join(
  canaryRoot,
  "data/modules/scripts/gamestore/catalog",
);
const itemCatalogPath = join(here, "../server/data/item-catalog.json");
const outfitDataPath = join(here, "../server/src/outfit/outfitCatalogData.ts");
const outPath = join(here, "../server/src/store/storeCatalogData.ts");

/** Canary category modules, in the order the store lists them. */
const MODULES = [
  { module: "premium_time", id: "premium-time" },
  { module: "boost", id: "boosts" },
  { module: "consumables_potions", id: "potions" },
  { module: "consumables_runes", id: "runes" },
  { module: "consumables_kegs", id: "kegs" },
  { module: "consumables_exercise_weapons", id: "exercise-weapons" },
  { module: "cosmetics_outfits", id: "outfits" },
  { module: "cosmetics_mounts", id: "mounts" },
  { module: "house_upgrades", id: "upgrades" },
  { module: "house_furniture", id: "furniture" },
  { module: "house_decorations", id: "decorations" },
  { module: "extras_extras_services", id: "extra-services" },
  { module: "extras_usefull_things", id: "useful-things" },
];

/** Parent categories, keyed by the `parent` name the child modules declare. */
const PARENTS = [
  { id: "consumables", name: "Consumables" },
  { id: "cosmetics", name: "Cosmetics" },
  { id: "houses", name: "Houses" },
  { id: "extras", name: "Extras" },
];

/**
 * Known data bugs in Canary's shipped catalog, corrected at import. The base
 * "Exercise Wraps" offer names the *durable* wraps id; items.xml says the
 * 500-charge tier is 50293.
 */
const ITEM_ID_CORRECTIONS = [
  { name: "Exercise Wraps", charges: 500, from: 50_294, to: 50_293 },
];

/**
 * House offers whose item id does not match their name in items.xml: "Oven"
 * names 37272, a confetti cannon (the kitchen oven is 34272 — one digit
 * off), and the two carpets point at each other's rolled-up kit.
 */
const HOUSE_ITEM_ID_CORRECTIONS = [
  { name: "Oven", from: 37_272, to: 34_272 },
  { name: "Colourful Carpet", from: 24_417, to: 24_416 },
  { name: "Flowery Carpet", from: 24_416, to: 24_417 },
];

/**
 * Deliberate deviations from Canary's catalog, applied by offer name. This
 * server ships Canary's Gold Pouch as the Loot Pouch: a character-bound
 * container with slots that never run out that carried loot flows into (see
 * server/src/item/plan/planItemPouchPlacement.ts). It is renamed here so the
 * generated data matches the item, but it is NOT sold anymore — every
 * character owns one from creation, and storeCatalog.ts filters the product
 * out by its item type id. The Ultimate Mana Keg is the one keg Canary ships
 * without any description; it gets the sibling kegs' text. Descriptions are
 * stored post-`cleanDescription`, already in the store's marker format.
 */
const OFFER_OVERRIDES = [
  {
    name: "Gold Pouch",
    rename: "Loot Pouch",
    description:
      "Carries as many items of any kind as your capacity allows — its slots never run out.\n\n{character}\n{once}\n{useicon} use it to open it\n{info} all looted items go straight into it",
  },
  {
    // Canary's own typo; the item is an "ice chandelier".
    name: "Ice_Chandelier",
    rename: "Ice Chandelier",
  },
  {
    // Canary's own typo; items.xml calls the painting "arrival at Thais".
    name: "Arrival The Thais Paint",
    rename: "Arrival at Thais Painting",
  },
  {
    name: "Ultimate Mana Keg",
    description:
      "Fill up potions to restore your mana no matter where you are!\n\n{character}\n{vocationlevelcheck}\n{storeinboxicon} potions created from this keg will be sent to your Store inbox and can only be stored there and in depot box\n{info} usable 500 times a piece\n{info} saves capacity because it's constant weight equals only 250 potions",
  },
];

const SYMBOL_BY_KIND = {
  premium: "premium",
  "name-change": "name-change",
  "sex-change": "sex-change",
  "exp-boost": "exp-boost",
  "prey-slot": "prey-slot",
  "prey-wildcard": "prey-wildcard",
  "hunting-slot": "hunting",
  "temple-teleport": "temple",
};

function loadItemTypes() {
  const parsed = JSON.parse(readFileSync(itemCatalogPath, "utf8"));
  return new Map(
    Object.entries(parsed.items).map(([id, item]) => [Number(id), item]),
  );
}

/** Look types and mount ids the outfit catalog actually knows. */
function loadOutfitCatalog() {
  const source = readFileSync(outfitDataPath, "utf8");
  const outfits = new Map();
  const outfitsByName = new Map();
  for (const match of source.matchAll(
    /\{ lookType: (\d+), name: "([^"]*)", sex: "(male|female)", starter: (true|false), premium: (true|false), addons: (\d+) \}/g,
  )) {
    const lookType = Number(match[1]);
    const definition = {
      name: match[2],
      sex: match[3],
      addons: Number(match[6]),
    };
    outfits.set(lookType, definition);
    outfitsByName.set(`${definition.name.toLowerCase()}:${definition.sex}`, lookType);
  }
  const mounts = new Map();
  for (const match of source.matchAll(
    /\{ mountId: (\d+), name: "([^"]*)", lookType: (\d+)/g,
  )) {
    mounts.set(Number(match[1]), {
      name: match[2],
      lookType: Number(match[3]),
    });
  }
  if (outfits.size === 0 || mounts.size === 0) {
    throw new Error("outfitCatalogData.ts did not parse; regenerate it first");
  }
  return { outfits, outfitsByName, mounts };
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Canary's descriptions carry `{character}`-style markup tags that the
 * official client renders as icon lines. The tags are kept verbatim — the
 * client draws each one with OTClient's own inline icon — and only the HTML
 * italics and entities are normalised away.
 */
function cleanDescription(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<\/?i>/g, "")
    .replace(/&#8226;/g, "•")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim()
    .slice(0, 2048);
}

const TAG_ONLY_LINE = /^\{[a-z0-9|]+\}$/i;

/**
 * Canary ships most house items with tag lines only ("{house}\n{box}…") and
 * not one sentence of their own. When the pinned item catalog carries the
 * item's in-game description ("It depicts the two suns of Tibia…"), that
 * becomes the product's opening line; a house item without even that gets a
 * templated line from its kind (see `houseItemProse`). Either way the detail
 * pane reads like the rest of the store instead of a bare column of icons.
 */
function withItemProse(description, itemType, { name, kind }) {
  const hasProse = description
    .split("\n")
    .some((line) => line.length > 0 && !TAG_ONLY_LINE.test(line));
  if (hasProse) return description;
  const prose =
    itemType?.description?.trim() ||
    (kind === "house-item" && itemType ? houseItemProse(name, itemType) : "");
  if (!prose) return description;
  const sentence = /[.!?]$/.test(prose) ? prose : `${prose}.`;
  return description.length > 0 ? `${sentence}\n\n${description}` : sentence;
}

const HOUSE_ITEM_KINDS = [
  {
    test: /\b(chair|stool|bench|hassock|couch|cushion)$/i,
    line: (subject) => `${subject} — take a seat and make yourself at home.`,
  },
  {
    test: /\b(table|workbench)$/i,
    line: (subject) => `${subject}, with room for whatever you set on it.`,
  },
  {
    test: /\b(carpet|rug|mat|parquet|floor|tiles|planks|intarsia|grass)(?: \d+)?$/i,
    primaryType: "floor decorations",
    line: (subject) => `${subject} to lay over the floor of your house.`,
  },
  {
    test: /\b(lamps?|candelabra|candle holder|chandelier|fire bowl|torch|light)(?: of change)?$/i,
    primaryType: "light sources",
    line: (subject) => `${subject} to light up a room of your house.`,
  },
  {
    test: /\b(painting|portrait|drawing|tapestry|flag|panel|panel base)$|^painting of\b/i,
    line: (subject) => `${subject} to adorn a wall of your house.`,
  },
  {
    test: /\b(cabinet|cupboard|wallcupboard|chest|trunk|shelf|bookcase|book case|bookstand|item stand|spice rack|rack|display|shield|clock|mirror|basin|bulb|sphere)$/i,
    primaryType: "furniture",
    line: (subject) => `${subject} to furnish your house.`,
  },
];

/** Words a store name keeps capitalised when it is lowered into a sentence. */
const PROPER_NOUNS = new Set([
  "Zaoan",
  "Thais",
  "Tibia",
  "Ferumbras",
  "King",
  "Tibianus",
  "Queen",
  "Eloise",
  "Tibiasula",
  "Hrodmir",
  "Venorean",
  "Yalaharian",
  "Owin",
  "Hortensis",
]);

/** Store names that read as more than one thing, or as a mass noun. */
const NO_ARTICLE_HEADS = /(?:[^s]s|fungi|grass)$/i;

/**
 * One templated sentence for a house item Canary describes with tags alone,
 * in the voice of the store's other blurbs: the offer's own name lowered into
 * a sentence (so the furniture set reads naturally — "a ferocious cabinet"),
 * then what it is for. The store name is used rather than the item's catalog
 * name because Canary's house offers point at kit variants ("rolled-up azure
 * carpet") and painting titles ("the streets of Tibia"). Multi-part pieces
 * name their part, and anything that opens says how many slots it holds —
 * read from the pinned catalog rather than guessed.
 */
function houseItemProse(storeName, itemType) {
  const part = /^(.*?)\s+(large\s+)?(left|middle|right)$/i.exec(storeName);
  if (part) {
    const piece = withArticle(
      `${part[2] ? "large " : ""}${lowerName(part[1])}`,
    );
    return (
      `The ${part[3].toLowerCase()} part of ${piece}. ` +
      "Place the parts side by side for the full piece."
    );
  }
  const subject = capitalize(withArticle(lowerName(storeName)));
  if (itemType.containerCapacity > 0) {
    return (
      `${subject}. It opens as a container with ${itemType.containerCapacity} ` +
      "slots, so it stores your belongings as well as it looks."
    );
  }
  const primaryType = itemType.primaryType ?? "";
  const kind = HOUSE_ITEM_KINDS.find(
    (candidate) =>
      candidate.test.test(storeName) || candidate.primaryType === primaryType,
  );
  return kind ? kind.line(subject) : `${subject} to decorate your house.`;
}

function lowerName(storeName) {
  return storeName
    .replace(/\s+\d+$/, "")
    .split(" ")
    .map((word) => (PROPER_NOUNS.has(word) ? word : word.toLowerCase()))
    .join(" ");
}

function withArticle(name) {
  // "pair of bellows" is one pair; "wooden sandals" are several.
  const head = name.includes(" of ") ? name.slice(0, name.indexOf(" of ")) : name;
  if (NO_ARTICLE_HEADS.test(head)) return name;
  return `${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function integerOrNull(value) {
  return Number.isInteger(value) ? value : null;
}

/**
 * Maps one Canary offer onto a grant this server can perform, or returns a
 * reason it cannot. The grant is what the purchase transaction executes; the
 * client never sees it.
 */
function toGrant(offer, context) {
  const type = constantName(offer.type);
  const { itemTypes, outfits, mounts } = context;

  if (type === "OFFER_TYPE_PREMIUM") {
    const days = integerOrNull(offer.validUntil);
    if (!days) return { skip: "premium offer without a day count" };
    return {
      kind: "premium",
      name: "Premium Time",
      id: `premium-${days}`,
      grant: { kind: "premium", days },
    };
  }

  if (type === "OFFER_TYPE_OUTFIT" || type === "OFFER_TYPE_OUTFIT_ADDON") {
    let male = integerOrNull(offer.sexId?.male);
    let female = integerOrNull(offer.sexId?.female);
    if (!male || !female) return { skip: "outfit offer without both sexes" };
    // Canary's store catalog carries at least one copy-paste error: the Trophy
    // Hunter offer names Lupine Warden's look types. `outfits.xml` is the
    // authority on which look types an outfit has, so when the offer's own
    // name resolves there and disagrees, the name wins.
    const outfitName = String(offer.name ?? "")
      .replace(/^Full\s+/i, "")
      .replace(/\s+Outfit$/i, "")
      .toLowerCase();
    const namedMale = context.outfitsByName.get(`${outfitName}:male`);
    const namedFemale = context.outfitsByName.get(`${outfitName}:female`);
    if (
      namedMale !== undefined &&
      namedFemale !== undefined &&
      (namedMale !== male || namedFemale !== female)
    ) {
      context.corrections.push(
        `"${offer.name}" named look types ${male}/${female}; outfits.xml says ` +
          `${namedMale}/${namedFemale}`,
      );
      male = namedMale;
      female = namedFemale;
    }
    const maleOutfit = outfits.get(male);
    const femaleOutfit = outfits.get(female);
    if (!maleOutfit || !femaleOutfit) {
      return { skip: `look type ${male}/${female} is not in the outfit catalog` };
    }
    if (maleOutfit.sex !== "male" || femaleOutfit.sex !== "female") {
      return { skip: `look type ${male}/${female} has the wrong sex` };
    }
    const requested = integerOrNull(offer.addon) ?? 0;
    // Never grant an addon bit the sprite pack cannot draw.
    const drawable = Math.min(maleOutfit.addons, femaleOutfit.addons);
    const addons = drawable >= 2 ? requested & 3 : requested & 1;
    const isAddonOnly = type === "OFFER_TYPE_OUTFIT_ADDON";
    return {
      kind: isAddonOnly ? "outfit-addon" : "outfit",
      id: `${isAddonOnly ? "outfit-addon" : "outfit"}-${male}${
        isAddonOnly ? `-${addons}` : ""
      }`,
      icon: { kind: "outfit", lookType: male, addons },
      grant: { kind: isAddonOnly ? "outfit-addon" : "outfit", male, female, addons },
    };
  }

  if (type === "OFFER_TYPE_MOUNT") {
    const mountId = integerOrNull(offer.id);
    const mount = mountId === null ? undefined : mounts.get(mountId);
    if (!mount) return { skip: `mount ${offer.id} is not in the mount catalog` };
    return {
      kind: "mount",
      id: `mount-${mountId}`,
      icon: { kind: "mount", lookType: mount.lookType },
      grant: { kind: "mount", mountId },
    };
  }

  if (
    type === "OFFER_TYPE_ITEM" ||
    type === "OFFER_TYPE_ITEM_UNIQUE" ||
    type === "OFFER_TYPE_STACKABLE" ||
    type === "OFFER_TYPE_CHARGES"
  ) {
    let itemTypeId = integerOrNull(offer.itemtype);
    // Ultimate Health Keg spells its charge count `count` where every other
    // keg uses `charges`; both mean "usable N times a piece".
    const charges = integerOrNull(offer.charges) ?? integerOrNull(offer.count);
    const correction = ITEM_ID_CORRECTIONS.find(
      (candidate) =>
        candidate.name === offer.name &&
        candidate.charges === charges &&
        candidate.from === itemTypeId,
    );
    if (correction) {
      context.corrections.push(
        `"${offer.name}" (${charges} charges) named item ${correction.from}; ` +
          `items.xml says ${correction.to}`,
      );
      itemTypeId = correction.to;
    }
    const itemType = itemTypeId === null ? undefined : itemTypes.get(itemTypeId);
    if (!itemType) return { skip: `item ${offer.itemtype} is not in the catalog` };
    if (!itemType.pickupable) return { skip: `item ${itemTypeId} is not pickupable` };
    if (type === "OFFER_TYPE_CHARGES") {
      if (!charges) return { skip: `item ${itemTypeId} charges offer without charges` };
      return {
        kind: "charges",
        id: `charges-${itemTypeId}-${charges}`,
        icon: { kind: "item", itemTypeId },
        grant: { kind: "charges", itemTypeId, charges },
      };
    }
    const count = integerOrNull(offer.count) ?? 1;
    const stackable = type === "OFFER_TYPE_STACKABLE";
    if (!stackable && count !== 1) {
      return { skip: `item ${itemTypeId} is not stackable but has count ${count}` };
    }
    if (stackable && itemType.maxCount <= 1) {
      return { skip: `item ${itemTypeId} is sold stackable but does not stack` };
    }
    return {
      kind: stackable ? "stackable" : "item",
      id: `item-${itemTypeId}-${count}`,
      count,
      icon: { kind: "item", itemTypeId },
      // `unique` mirrors Canary's ITEM_UNIQUE: refused when already owned.
      grant: {
        kind: stackable ? "stackable" : "item",
        itemTypeId,
        count,
        unique: type === "OFFER_TYPE_ITEM_UNIQUE",
      },
    };
  }

  if (type === "OFFER_TYPE_HOUSE") {
    let itemTypeId = integerOrNull(offer.itemtype);
    const correction = HOUSE_ITEM_ID_CORRECTIONS.find(
      (candidate) => candidate.name === offer.name && candidate.from === itemTypeId,
    );
    if (correction) {
      context.corrections.push(
        `"${offer.name}" named item ${correction.from}; items.xml says ` +
          `${correction.to}`,
      );
      itemTypeId = correction.to;
    }
    const itemType = itemTypeId === null ? undefined : itemTypes.get(itemTypeId);
    if (!itemType) return { skip: `item ${offer.itemtype} is not in the catalog` };
    const count = integerOrNull(offer.count) ?? 1;
    // Casks are one kit carrying hundreds of potion servings; that liquid
    // system does not exist here, so anything sold by the serving is skipped.
    if (count > 25) {
      return { skip: `house item ${itemTypeId} sells ${count} servings (cask)` };
    }
    return {
      kind: "house-item",
      id: `house-item-${itemTypeId}-${count}`,
      ...(count > 1 ? { count } : {}),
      icon: { kind: "item", itemTypeId },
      grant: { kind: "house-item", itemTypeId, count },
    };
  }

  if (type === "OFFER_TYPE_NAMECHANGE") {
    return { kind: "name-change", id: "name-change", grant: { kind: "name-change" } };
  }
  if (type === "OFFER_TYPE_SEXCHANGE") {
    return { kind: "sex-change", id: "sex-change", grant: { kind: "sex-change" } };
  }
  if (type === "OFFER_TYPE_EXPBOOST") {
    return { kind: "exp-boost", id: "exp-boost", grant: { kind: "exp-boost" } };
  }
  if (type === "OFFER_TYPE_PREYSLOT") {
    return { kind: "prey-slot", id: "prey-slot", grant: { kind: "prey-slot" } };
  }
  if (type === "OFFER_TYPE_HUNTINGSLOT") {
    return { kind: "hunting-slot", id: "hunting-slot", grant: { kind: "hunting-slot" } };
  }
  if (type === "OFFER_TYPE_PREYBONUS") {
    const count = integerOrNull(offer.count) ?? 1;
    return {
      kind: "prey-wildcard",
      id: `prey-wildcard-${count}`,
      count,
      grant: { kind: "prey-wildcard", count },
    };
  }
  if (type === "OFFER_TYPE_TEMPLE") {
    return {
      kind: "temple-teleport",
      id: "temple-teleport",
      grant: { kind: "temple-teleport" },
    };
  }

  return { skip: `unsupported offer type ${type ?? "<none>"}` };
}

function offerName(offer, mapped) {
  if (typeof offer.name === "string") return offer.name.slice(0, 64);
  if (mapped.name) return mapped.name;
  return null;
}

function importCatalog() {
  const itemTypes = loadItemTypes();
  const { outfits, outfitsByName, mounts } = loadOutfitCatalog();
  const corrections = [];
  const context = { itemTypes, outfits, outfitsByName, mounts, corrections };
  const categories = [];
  const productsByCategory = new Map();
  const skipped = [];
  const parentsUsed = new Set();
  /**
   * Offer ids must be globally unique — the purchase message names one — but
   * Canary ships a few products pointing at the same item id ("Heart Table"
   * reuses Heart Chest's id, "Volcanic Spire" reuses Volcanic Sphere's). The
   * first product keeps the offer; later collisions are dropped and reported.
   */
  const usedOfferIds = new Map();

  for (const entry of MODULES) {
    const source = readFileSync(join(catalogRoot, `${entry.module}.lua`), "utf8");
    const parsed = parseCanaryStoreCatalogModule(source);
    const parent = PARENTS.find((candidate) => candidate.name === parsed.parent);
    if (parsed.parent && !parent) {
      throw new Error(`unknown parent category "${parsed.parent}"`);
    }
    if (parent) parentsUsed.add(parent.id);

    const products = new Map();
    for (const offer of parsed.offers ?? []) {
      const mapped = toGrant(offer, context);
      if (mapped.skip) {
        skipped.push({ module: entry.module, reason: mapped.skip });
        continue;
      }
      const canaryName = offerName(offer, mapped);
      if (!canaryName) {
        skipped.push({ module: entry.module, reason: "offer has no literal name" });
        continue;
      }
      const override = OFFER_OVERRIDES.find(
        (candidate) => candidate.name === canaryName,
      );
      if (override?.rename) {
        context.corrections.push(
          `"${canaryName}" sold as "${override.rename}" (deliberate deviation)`,
        );
      } else if (override) {
        context.corrections.push(
          `"${canaryName}" given a description (Canary ships none)`,
        );
      }
      const name = override?.rename ?? canaryName;
      const price = integerOrNull(offer.price);
      if (!price || price < 1) {
        skipped.push({ module: entry.module, reason: `offer "${name}" has no price` });
        continue;
      }
      // One product, several priced variants — the layout the official store
      // uses ("Great Health Potion" with 100x / 250x / 500x buttons). Premium
      // groups by kind so its four durations are one product, as in Tibia.
      const productKey =
        mapped.kind === "premium" ? "premium" : `${mapped.kind}:${name}`;
      const claimedBy = usedOfferIds.get(mapped.id);
      if (claimedBy !== undefined && claimedBy !== productKey) {
        skipped.push({
          module: entry.module,
          reason:
            `offer id ${mapped.id} of "${name}" already belongs to another ` +
            "product (Canary data bug)",
        });
        continue;
      }
      usedOfferIds.set(mapped.id, productKey);
      const existing = products.get(productKey);
      const subOffer = {
        id: mapped.id,
        price,
        ...(mapped.count === undefined ? {} : { count: mapped.count }),
        grant: mapped.grant,
      };
      if (existing) {
        if (existing.subOffers.some((candidate) => candidate.id === subOffer.id)) {
          skipped.push({
            module: entry.module,
            reason: `duplicate offer id ${subOffer.id}`,
          });
          continue;
        }
        existing.subOffers.push(subOffer);
        continue;
      }
      products.set(productKey, {
        id:
          mapped.kind === "premium"
            ? "premium-time"
            : `${entry.id}-${slug(name)}`,
        name: mapped.kind === "premium" ? "Premium Time" : name,
        kind: mapped.kind,
        description:
          override?.description ??
          withItemProse(
            cleanDescription(offer.description),
            "itemTypeId" in mapped.grant
              ? itemTypes.get(mapped.grant.itemTypeId)
              : undefined,
            { name, kind: mapped.kind },
          ),
        icon: mapped.icon ?? {
          kind: "symbol",
          symbol: SYMBOL_BY_KIND[mapped.kind] ?? "premium",
        },
        subOffers: [subOffer],
      });
    }

    if (products.size === 0) {
      skipped.push({ module: entry.module, reason: "no deliverable offers" });
      continue;
    }
    const products_ = [...products.values()];
    categories.push({
      id: entry.id,
      name: typeof parsed.name === "string" ? parsed.name : titleFrom(entry.id),
      parentId: parent?.id ?? null,
      // A category wears the icon of its first product; OTClient's category
      // art is downloaded rather than bundled, so this is the real art we do
      // ship.
      icon: products_[0].icon,
    });
    productsByCategory.set(entry.id, [...products.values()]);
  }

  const parents = PARENTS.filter((parent) => parentsUsed.has(parent.id)).map(
    (parent) => {
      const firstChild = categories.find(
        (category) => category.parentId === parent.id,
      );
      if (!firstChild) throw new Error(`parent ${parent.id} has no children`);
      return {
        id: parent.id,
        name: parent.name,
        parentId: null,
        icon: firstChild.icon,
      };
    },
  );
  return {
    categories: [...parents, ...categories],
    productsByCategory,
    skipped,
    corrections,
  };
}

function titleFrom(id) {
  return id
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

const { categories, productsByCategory, skipped, corrections } = importCatalog();

const serialized = `// Generated by tools/importCanaryStoreCatalog.mjs from Canary's
// data/modules/scripts/gamestore/catalog — do not edit by hand.
//
// Every entry here is deliverable by this server: item ids exist in the pinned
// item catalog and are carriable (house furniture via decoration kits), look
// types and mount ids exist in the outfit catalog. Offer types whose systems
// do not exist yet (blessings, hirelings, charm expansion, instant reward
// access, beds, casks, tournament) are absent by design. Behaviour lives in
// storeCatalog.ts; this file is data only.
import type { StoreCatalogCategory } from "./storeCatalog";

export const STORE_CATALOG_CATEGORIES: ReadonlyArray<StoreCatalogCategory> = ${JSON.stringify(
  categories.map((category) => ({
    ...category,
    products: productsByCategory.get(category.id) ?? [],
  })),
  null,
  2,
)};
`;

writeFileSync(outPath, serialized);

const productCount = [...productsByCategory.values()].reduce(
  (total, products) => total + products.length,
  0,
);
const offerCount = [...productsByCategory.values()].reduce(
  (total, products) =>
    total + products.reduce((sum, product) => sum + product.subOffers.length, 0),
  0,
);
console.log(
  `Wrote ${categories.length} categories, ${productCount} products and ` +
    `${offerCount} offers to ${outPath}.`,
);
if (corrections.length > 0) {
  console.log(`Corrected ${corrections.length} offer(s) against outfits.xml:`);
  for (const correction of corrections) console.log(`  ${correction}`);
}
const reasons = new Map();
for (const entry of skipped) {
  const key = `${entry.module}: ${entry.reason.replace(/\d+/g, "N")}`;
  reasons.set(key, (reasons.get(key) ?? 0) + 1);
}
if (reasons.size > 0) {
  console.log(`Skipped ${skipped.length} offers:`);
  for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(4)} × ${reason}`);
  }
}
