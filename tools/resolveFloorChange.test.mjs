import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveFloorChange } from "./resolveFloorChange.mjs";

const source = { x: 100, y: 200, z: 7 };
const none = () => undefined;

test("resolves every upward cardinal and alternate offset", () => {
  assert.deepEqual(resolveFloorChange(source, "north", none), {
    x: 100,
    y: 199,
    z: 6,
  });
  assert.deepEqual(resolveFloorChange(source, "south", none), {
    x: 100,
    y: 201,
    z: 6,
  });
  assert.deepEqual(resolveFloorChange(source, "southalt", none), {
    x: 100,
    y: 202,
    z: 6,
  });
  assert.deepEqual(resolveFloorChange(source, "east", none), {
    x: 101,
    y: 200,
    z: 6,
  });
  assert.deepEqual(resolveFloorChange(source, "eastalt", none), {
    x: 102,
    y: 200,
    z: 6,
  });
  assert.deepEqual(resolveFloorChange(source, "west", none), {
    x: 99,
    y: 200,
    z: 6,
  });
});

test("resolves downward offsets from the lower floor metadata", () => {
  const at = (position) => {
    if (position.x === 100 && position.y === 200 && position.z === 8) {
      return "north";
    }
    return undefined;
  };

  assert.deepEqual(resolveFloorChange(source, "down", at), {
    x: 100,
    y: 201,
    z: 8,
  });
});

test("honors south-alt and east-alt downward entrance tiles", () => {
  const southAlt = (position) =>
    position.x === 100 && position.y === 199 && position.z === 8
      ? "southalt"
      : undefined;
  const eastAlt = (position) =>
    position.x === 99 && position.y === 200 && position.z === 8
      ? "eastalt"
      : undefined;

  assert.deepEqual(resolveFloorChange(source, "down", southAlt), {
    x: 100,
    y: 198,
    z: 8,
  });
  assert.deepEqual(resolveFloorChange(source, "down", eastAlt), {
    x: 98,
    y: 200,
    z: 8,
  });
});

test("rejects floor changes beyond the map floor range", () => {
  assert.equal(resolveFloorChange({ ...source, z: 0 }, "north", none), null);
  assert.equal(resolveFloorChange({ ...source, z: 15 }, "down", none), null);
});
