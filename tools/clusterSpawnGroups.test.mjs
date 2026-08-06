import assert from "node:assert/strict";
import { test } from "node:test";
import { clusterSpawnGroups } from "./clusterSpawnGroups.mjs";

const slot = (x, y, z = 8) => ({ typeId: "rotworm", home: { x, y, z } });

const row = (x, y, z, count) =>
  Array.from({ length: count }, (_, index) => slot(x + index * 2, y, z));

test("splits caves that are far apart on the same floor", () => {
  const groups = clusterSpawnGroups(
    [...row(1000, 1000, 8, 8), ...row(1400, 1000, 8, 8)],
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
    [...row(1000, 1000, 8, 8), ...row(1002, 1004, 9, 8)],
    { minSize: 4 },
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].slots.length, 16);
  assert.equal(groups[0].box.minZ, 8);
  assert.equal(groups[0].box.maxZ, 9);
});

test("leaves floors that only share a bounding box apart", () => {
  const groups = clusterSpawnGroups(
    [...row(1000, 1000, 8, 8), ...row(1000, 1400, 9, 8)],
    { minSize: 4 },
  );
  assert.equal(groups.length, 2);
});

test("drops populations too small to be worth a hunt", () => {
  const groups = clusterSpawnGroups([...row(1000, 1000, 8, 3)], { minSize: 8 });
  assert.deepEqual(groups, []);
});

test("names the floor most of the cave lives on", () => {
  const groups = clusterSpawnGroups(
    [...row(1000, 1000, 8, 3), ...row(1002, 1004, 9, 9)],
    { minSize: 4 },
  );
  assert.equal(groups[0].box.z, 9);
});
