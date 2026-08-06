import assert from "node:assert/strict";
import { test } from "node:test";
import { orderHuntRing } from "./orderHuntRing.mjs";

const at = (x, y) => ({ x, y, z: 8 });
const straightLine = (from, to) =>
  Math.abs(from.x - to.x) + Math.abs(from.y - to.y);

test("keeps a two-stop route as it is", () => {
  const anchors = [at(0, 0), at(5, 0)];
  assert.deepEqual(orderHuntRing(anchors, straightLine), anchors);
});

test("walks a square in order instead of criss-crossing it", () => {
  const ordered = orderHuntRing(
    [at(0, 0), at(10, 10), at(10, 0), at(0, 10)],
    straightLine,
  );
  const length = ordered.reduce(
    (total, anchor, index) =>
      total + straightLine(anchor, ordered[(index + 1) % ordered.length]),
    0,
  );
  assert.equal(length, 40);
});

test("leaves anchors with no walk between them for the caller to drop", () => {
  const island = at(500, 500);
  const distance = (from, to) =>
    from === island || to === island ? Infinity : straightLine(from, to);
  const ordered = orderHuntRing(
    [at(0, 0), at(4, 0), at(4, 4), island],
    distance,
  );
  assert.equal(ordered.at(-1), island);
});
