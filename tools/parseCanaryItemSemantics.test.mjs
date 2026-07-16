import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCanaryItemSemantics } from "./parseCanaryItemSemantics.mjs";

test("parses selected navigation semantics and expands item ranges", () => {
  const items = parseCanaryItemSemantics(`
    <items>
      <item id="100" name="stairs">
        <attribute key="floorchange" value="north"/>
        <attribute key="movable" value="0"/>
      </item>
      <item fromid="101" toid="102" name="doors">
        <attribute key="type" value="door"/>
        <attribute key="blockProjectile" value="1"/>
      </item>
    </items>
  `);

  assert.deepEqual(items, {
    100: { name: "stairs", floorChange: "north", movable: false },
    101: { name: "doors", type: "door", blocksProjectile: true },
    102: { name: "doors", type: "door", blocksProjectile: true },
  });
});

test("ignores nested script attributes", () => {
  const items = parseCanaryItemSemantics(`
    <items>
      <item id="200" name="field">
        <attribute key="type" value="magicfield"/>
        <attribute key="script" value="moveevent">
          <attribute key="type" value="door"/>
        </attribute>
      </item>
    </items>
  `);

  assert.deepEqual(items, { 200: { name: "field", type: "magicfield" } });
});

test("preserves the names of self-closing item definitions", () => {
  const items = parseCanaryItemSemantics(`
    <items><item id="967" article="a" name="hole"/></items>
  `);

  assert.deepEqual(items, { 967: { name: "hole", article: "a" } });
});

test("retains equipment stats and server-authored equip requirements", () => {
  const items = parseCanaryItemSemantics(`
    <items>
      <item id="3271" article="a" name="spike sword">
        <attribute key="primarytype" value="sword weapons"/>
        <attribute key="weaponType" value="sword"/>
        <attribute key="attack" value="24"/>
        <attribute key="extradef" value="2"/>
        <attribute key="defense" value="21"/>
        <attribute key="weight" value="5000"/>
        <attribute key="script" value="moveevent;weapon">
          <attribute key="level" value="20"/>
          <attribute key="vocation" value="Knight;true, Elite Knight"/>
          <attribute key="slot" value="hand"/>
        </attribute>
      </item>
    </items>
  `);

  assert.deepEqual(items, {
    3271: {
      name: "spike sword",
      article: "a",
      primaryType: "sword weapons",
      weaponType: "sword",
      attack: 24,
      extraDefense: 2,
      defense: 21,
      weight: 5000,
      requiredLevel: 20,
      vocations: ["Knight", "Elite Knight"],
      equipmentSlot: "hand",
    },
  });
});

test("rejects unknown floor-change values", () => {
  assert.throws(
    () =>
      parseCanaryItemSemantics(`
        <item id="300">
          <attribute key="floorchange" value="sideways"/>
        </item>
      `),
    /unknown floorchange sideways/,
  );
});

test("preserves every supported Canary floor-change kind", () => {
  const floorChanges = [
    "down",
    "north",
    "south",
    "southalt",
    "west",
    "east",
    "eastalt",
  ];
  const definitions = floorChanges
    .map(
      (floorChange, index) => `
        <item id="${400 + index}">
          <attribute key="floorchange" value="${floorChange}"/>
        </item>`,
    )
    .join("");
  const items = parseCanaryItemSemantics(`<items>${definitions}</items>`);

  assert.deepEqual(
    Object.values(items).map((item) => item.floorChange),
    floorChanges,
  );
});
