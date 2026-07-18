import assert from "node:assert/strict";
import test from "node:test";
import { parseCanaryNpcShops } from "./parseCanaryNpcShops.mjs";

const items = {
  2874: { name: "vial", render: { fluidContainer: true } },
  3552: { name: "leather boots", render: { fluidContainer: false } },
  50168: { name: "nunchaku", render: { fluidContainer: false } },
};

test("imports literal prices, subtypes, storage gates, and custom currency", () => {
  const result = parseCanaryNpcShops(
    [
      {
        typeId: "merchant",
        path: "npc/merchant.lua",
        source: `
local quest = Storage.Quest.Example
npcConfig.currency = 50168
npcConfig.shop = {
  { itemName = "vial of water", clientId = 2874, buy = 10, count = 1 },
  { clientId = 3552, sell = 2, storageKey = quest, storageValue = 4 },
}
`,
      },
    ],
    items,
  );

  assert.equal(result.shops.length, 1);
  assert.equal(result.shops[0].currencyItemTypeId, 50168);
  assert.deepEqual(result.shops[0].entries[0], {
    offerId: "item-2874-1",
    itemTypeId: 2874,
    name: "vial of water",
    minimumAmount: 1,
    maximumAmount: 100,
    subtype: 1,
    buyPrice: 10,
  });
  assert.deepEqual(result.shops[0].entries[1].availability, [
    {
      kind: "storage-at-least",
      key: "Storage.Quest.Example",
      value: 4,
    },
  ]);
  assert.equal(result.report.unsupportedRows, 0);
});

test("reports a declared row instead of silently dropping it", () => {
  const result = parseCanaryNpcShops(
    [
      {
        typeId: "broken",
        path: "npc/broken.lua",
        source:
          "npcConfig.shop = { { itemName = 'mystery', clientId = missingId, buy = 5 } }",
      },
    ],
    items,
  );

  assert.equal(result.shops.length, 0);
  assert.equal(result.report.declaredRows, 1);
  assert.equal(result.report.unsupportedRows, 1);
});

test("preserves Canary's implicit zero-cost buy offer", () => {
  const result = parseCanaryNpcShops(
    [
      {
        typeId: "simon-the-beggar",
        path: "npc/simon_the_beggar.lua",
        source: `npcConfig.shop = {
          { itemName = "shovel", clientId = 3457, count = 1 },
        }`,
      },
    ],
    {
      3457: {
        id: 3457,
        name: "shovel",
        render: { fluidContainer: false },
      },
    },
  );

  assert.equal(result.shops[0].entries[0].buyPrice, 0);
  assert.equal(result.report.unsupportedRows, 0);
});
