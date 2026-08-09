import assert from "node:assert/strict";
import { test } from "node:test";
import { getMapItemSemantics } from "./getMapItemSemantics.mjs";

const appearance = (overrides = {}) => ({
  sprites: [1],
  flags: {
    ground: false,
    groundBorder: false,
    groundSpeed: 0,
    onTop: false,
    notMoveable: true,
    pickupable: false,
    notWalkable: false,
    blockProjectile: false,
    notPathable: false,
    container: false,
    dontHide: false,
    onBottom: false,
    elevation: 0,
    hangable: false,
    ...overrides,
  },
});

test("merges ground, collision, projectile, path, and cover semantics", () => {
  assert.deepEqual(
    getMapItemSemantics(
      appearance({
        ground: true,
        groundSpeed: 150,
        blockProjectile: true,
        notPathable: true,
      }),
      { blocking: true },
    ),
    {
      ground: true,
      groundSpeed: 150,
      elevation: 0,
      stackOrder: "ground",
      floorChange: undefined,
      hangable: false,
      container: false,
      door: false,
      field: false,
      blocksSolid: true,
      blocksProjectile: true,
      blocksPath: true,
      limitsFloorView: true,
      movable: false,
      pickupable: false,
      mutable: false,
      interactive: false,
    },
  );
});

test("preserves border, elevation, stack, floor-change, and hangable semantics", () => {
  const border = getMapItemSemantics(
    appearance({ groundBorder: true, elevation: 8, hangable: true }),
    { floorChange: "east" },
  );
  const bottom = getMapItemSemantics(appearance({ onBottom: true }));
  const top = getMapItemSemantics(appearance({ onTop: true }));

  assert.equal(border.stackOrder, "border");
  assert.equal(border.elevation, 8);
  assert.equal(border.floorChange, "east");
  assert.equal(border.hangable, true);
  assert.equal(bottom.stackOrder, "bottom");
  assert.equal(top.stackOrder, "top");
});

test("classifies movable, container, door, and field items as mutable", () => {
  expectMutable(appearance({ notMoveable: false }), { name: "parcel" });
  expectMutable(appearance({ container: true }), { name: "backpack" });
  expectMutable(appearance(), { name: "door", type: "door" });
  expectMutable(appearance(), { name: "fire field", type: "magicfield" });

  assert.equal(
    getMapItemSemantics(appearance(), { name: "door", type: "door" }).door,
    true,
  );
  assert.equal(
    getMapItemSemantics(appearance(), {
      name: "fire field",
      type: "magicfield",
    }).field,
    true,
  );
});

test("keeps immutable ladders and teleports interactive", () => {
  const ladder = getMapItemSemantics(appearance(), { type: "ladder" });
  const teleport = getMapItemSemantics(appearance(), { type: "teleport" });

  assert.equal(ladder.mutable, false);
  assert.equal(ladder.interactive, true);
  assert.equal(teleport.mutable, false);
  assert.equal(teleport.interactive, true);
});

test("gives the server the exercise dummy standing on a tile", () => {
  // Free dummies are neither movable nor pickupable, so only the type puts
  // them in server-owned world items — which is the only classification
  // `loadMapItems` surfaces for a use-with action to find.
  const dummy = getMapItemSemantics(appearance(), {
    name: "exercise dummy",
    type: "dummy",
  });

  assert.equal(dummy.mutable, true);
  assert.equal(dummy.interactive, true);
});

test("gives the server the reward shrines the reward wall opens from", () => {
  // 25802/25803 are the wall-mounted shrines the map places in every city
  // temple: immovable, unpickupable, untyped scenery. Only the id list puts
  // them in server-owned world items, and without that the daily-shrine use
  // action can never see one (they stay baked in the client's draw layer).
  for (const clientId of [25_720, 25_721, 25_722, 25_723, 25_802, 25_803]) {
    const shrine = getMapItemSemantics(
      { ...appearance({ onBottom: true }), clientId },
      { name: "reward shrine", movable: false, pickupable: false },
    );
    assert.equal(shrine.mutable, true, `shrine ${clientId} must be mutable`);
    assert.equal(shrine.interactive, true);
  }
});

test("gives the server the quest-touch wall at its scripted position only", () => {
  // The Cults of Tibia decaying wall (32396,31806,8) must be server-owned so
  // the torch can remove it; every other stone wall of the same type stays
  // baked static scenery.
  const scripted = getMapItemSemantics(
    { ...appearance({ notWalkable: true }), clientId: 1295 },
    { name: "stone wall" },
    {},
    { x: 32396, y: 31806, z: 8 },
  );
  assert.equal(scripted.mutable, true);
  assert.equal(scripted.interactive, true);

  const elsewhere = getMapItemSemantics(
    { ...appearance({ notWalkable: true }), clientId: 1295 },
    { name: "stone wall" },
    {},
    { x: 32396, y: 31807, z: 8 },
  );
  assert.equal(elsewhere.mutable, false);

  const otherItemThere = getMapItemSemantics(
    { ...appearance({ notWalkable: true }), clientId: 1296 },
    { name: "stone wall" },
    {},
    { x: 32396, y: 31806, z: 8 },
  );
  assert.equal(otherItemThere.mutable, false);

  const noPosition = getMapItemSemantics(
    { ...appearance({ notWalkable: true }), clientId: 1295 },
    { name: "stone wall" },
  );
  assert.equal(noPosition.mutable, false);
});

test("classifies subtype, action, and text attributes deliberately", () => {
  assert.equal(
    getMapItemSemantics(appearance(), { name: "coins" }, { count: 20 }).mutable,
    true,
  );
  const action = getMapItemSemantics(appearance(), {}, { actionId: 5000 });
  assert.equal(action.mutable, false);
  assert.equal(action.interactive, true);
});

test("keeps trashholder liquids static map scenery", () => {
  const water = getMapItemSemantics(
    appearance({ ground: true, notWalkable: true }),
    { name: "shallow water", type: "trashholder", fluidSource: "water" },
  );

  assert.equal(water.mutable, false);
  assert.equal(water.interactive, false);
});

test("keeps appearance-only ids immutable until catalog rules exist", () => {
  const unknown = getMapItemSemantics(
    appearance({ notMoveable: false, pickupable: true }),
  );

  assert.equal(unknown.mutable, false);
  assert.equal(unknown.interactive, false);
});

test("keeps reserved zero-sprite ids out of mutable world state", () => {
  const reserved = getMapItemSemantics(
    { ...appearance({ notMoveable: false, pickupable: true }), sprites: [0] },
    { name: "RESERVED SPRITE" },
  );

  assert.equal(reserved.mutable, false);
  assert.equal(reserved.interactive, false);
});

function expectMutable(itemAppearance, staticItem = {}) {
  const semantics = getMapItemSemantics(itemAppearance, staticItem);
  assert.equal(semantics.mutable, true);
  assert.equal(semantics.interactive, true);
}
