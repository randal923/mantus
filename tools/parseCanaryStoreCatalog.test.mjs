import assert from "node:assert/strict";
import test from "node:test";
import {
  constantName,
  parseCanaryStoreCatalogModule,
} from "./parseCanaryStoreCatalog.mjs";

test("reads a category with its offers", () => {
  const parsed = parseCanaryStoreCatalogModule(`
    return {
      icons = { "Category_Mounts.png" },
      name = "Mounts",
      parent = "Cosmetics",
      rookgaard = true,
      offers = {
        {
          name = "Armoured War Horse",
          price = 870,
          id = 23,
          description = "A {speedboost} mount.",
          type = GameStore.OfferTypes.OFFER_TYPE_MOUNT,
        },
      },
    }
  `);

  assert.equal(parsed.name, "Mounts");
  assert.equal(parsed.parent, "Cosmetics");
  assert.equal(parsed.rookgaard, true);
  assert.deepEqual(parsed.icons, ["Category_Mounts.png"]);
  assert.equal(parsed.offers.length, 1);
  assert.equal(parsed.offers[0].price, 870);
  assert.equal(parsed.offers[0].description, "A {speedboost} mount.");
  assert.equal(constantName(parsed.offers[0].type), "OFFER_TYPE_MOUNT");
});

test("keeps nested tables, escapes, and apostrophes intact", () => {
  const parsed = parseCanaryStoreCatalogModule(`
    return {
      name = "Outfits",
      offers = {
        {
          name = "Full Arbalester Outfit",
          sexId = { female = 1450, male = 1449 },
          addon = 3,
          description = "Restores your character's hit points.\\nSecond line.",
          type = GameStore.OfferTypes.OFFER_TYPE_OUTFIT,
        },
      },
    }
  `);

  assert.deepEqual(parsed.offers[0].sexId, { female: 1450, male: 1449 });
  assert.equal(
    parsed.offers[0].description,
    "Restores your character's hit points.\nSecond line.",
  );
});

test("resolves local string constants and string.format over them", () => {
  const parsed = parseCanaryStoreCatalogModule(`
local premiumOfferName = "Premium Time"
local premiumDescription = "Access to Premium areas."
if vip then
  premiumDescription = "VIP perks."
end
return {
  name = premiumOfferName,
  offers = {
    {
      name = string.format("%s for 30 days", premiumOfferName),
      description = premiumDescription,
      price = 250,
      validUntil = 30,
    },
  },
}
  `);

  assert.equal(parsed.name, "Premium Time");
  assert.equal(parsed.offers[0].name, "Premium Time for 30 days");
  // The unconditional binding wins; the configManager branch is ignored.
  assert.equal(parsed.offers[0].description, "Access to Premium areas.");
  assert.equal(parsed.offers[0].validUntil, 30);
});

test("reports expressions it cannot evaluate instead of guessing", () => {
  const parsed = parseCanaryStoreCatalogModule(`
return {
  name = unknownCategoryName,
  offers = {
    { name = computeName(other), price = 250 },
  },
}
  `);

  assert.deepEqual(parsed.name, { constant: "unknownCategoryName" });
  assert.equal(parsed.offers[0].name.unresolved, true);
  assert.equal(parsed.offers[0].price, 250);
});

test("skips comments, including ones that contain braces", () => {
  const parsed = parseCanaryStoreCatalogModule(`
    return {
      -- a { brace } in a comment
      name = "Extras",
      --[[ block { comment } ]]
      offers = {},
    }
  `);

  assert.equal(parsed.name, "Extras");
  assert.deepEqual(parsed.offers, []);
});

test("constantName ignores plain values", () => {
  assert.equal(constantName("Mounts"), null);
  assert.equal(constantName(23), null);
  assert.equal(constantName({ unresolved: true, expression: "f()" }), null);
});
