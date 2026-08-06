import assert from "node:assert/strict";
import { test } from "node:test";
import { clusterSpawnGroups } from "./clusterSpawnGroups.mjs";

const slot = (x, y, z = 8) => ({ typeId: "rotworm", home: { x, y, z } });

/** A square-ish patch of spawns, the shape a real cave's floor has. */
const patch = (x, y, z, count) =>
  Array.from({ length: count }, (_, index) =>
    slot(x + (index % 4) * 3, y + Math.floor(index / 4) * 3, z),
  );

test("splits caves that are far apart on the same floor", () => {
  const groups = clusterSpawnGroups(
    [...patch(1000, 1000, 8, 8), ...patch(1400, 1000, 8, 8)],
    { minSize: 4 },
  );
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((group) => group.slots.length),
    [8, 8],
  );
});

test("joins the floors of one cave into a single hunt", () => {
  const groups = clusterSpawnGroups(
    [...patch(1000, 1000, 8, 8), ...patch(1001, 1001, 9, 8)],
    { minSize: 4 },
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].slots.length, 16);
  assert.equal(groups[0].box.minZ, 8);
  assert.equal(groups[0].box.maxZ, 9);
});

test("leaves floors that only share a bounding box apart", () => {
  const groups = clusterSpawnGroups(
    [...patch(1000, 1000, 8, 8), ...patch(1000, 1400, 9, 8)],
    { minSize: 4 },
  );
  assert.equal(groups.length, 2);
});

test("leaves a cave on the floor below that barely clips this one", () => {
  // Touching corners is how a whole continent of caves used to chain into
  // one "cluster": the floors must genuinely sit on top of each other.
  const groups = clusterSpawnGroups(
    [...patch(1000, 1000, 8, 8), ...patch(1008, 1008, 9, 8)],
    { minSize: 4 },
  );
  assert.equal(groups.length, 2);
});

test("splits a field too wide to be one hunting ground", () => {
  const wide = Array.from({ length: 40 }, (_, index) =>
    slot(1000 + index * 10, 1000, 8),
  );
  const groups = clusterSpawnGroups(wide, { minSize: 4, maxSpan: 120 });

  assert.ok(groups.length > 1);
  for (const group of groups) {
    assert.ok(group.box.maxX - group.box.minX <= 120);
  }
});

test("drops populations too small to be worth a hunt", () => {
  const groups = clusterSpawnGroups([...patch(1000, 1000, 8, 3)], { minSize: 8 });
  assert.deepEqual(groups, []);
});

test("names the floor most of the cave lives on", () => {
  const groups = clusterSpawnGroups(
    [...patch(1000, 1000, 8, 3), ...patch(1001, 1001, 9, 9)],
    { minSize: 4 },
  );
  assert.equal(groups[0].box.z, 9);
});
