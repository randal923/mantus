import assert from "node:assert/strict";
import test from "node:test";
import { parseHuntingGroundSpawns } from "./parseHuntingGroundSpawns.mjs";

const document = {
  formatVersion: 1,
  grounds: [
    {
      id: "test-ground",
      huntingPlace: "Test Ground",
      monsterTypeIds: ["test-rat", "test-snake"],
      radius: 2,
      respawnMs: 90_000,
      positions: [
        { x: 101, y: 101, z: 7 },
        { x: 102, y: 102, z: 7 },
      ],
    },
  ],
};
const huntingPlaces = [
  {
    Name: "Test Ground",
    Monsters: [{ Name: "Test Rat" }, { Name: "Test Snake" }],
    RoutePath: {
      Coordinates: {
        7: [[{ x: 100, y: 100, z: 7 }, { x: 110, y: 110, z: 7 }]],
      },
    },
  },
];
const options = {
  document,
  huntingPlaces,
  knownMonsterTypeIds: ["test-rat", "test-snake"],
  existingSlots: [],
  tileAt: () => "walkable",
};

test("creates deterministic typed spawn slots inside the hunting route", () => {
  const result = parseHuntingGroundSpawns(options);

  assert.equal(result.report.placements, 2);
  assert.deepEqual(
    result.slots.map((slot) => ({ id: slot.id, typeId: slot.typeId })),
    [
      { id: "hunting-ground:test-ground:000", typeId: "test-rat" },
      { id: "hunting-ground:test-ground:001", typeId: "test-snake" },
    ],
  );
});

test("rejects blocked, duplicate, and out-of-route positions", () => {
  assert.throws(
    () => parseHuntingGroundSpawns({ ...options, tileAt: () => "blocked" }),
    /not walkable/,
  );
  assert.throws(
    () =>
      parseHuntingGroundSpawns({
        ...options,
        existingSlots: [{ home: { x: 101, y: 101, z: 7 } }],
      }),
    /duplicates another spawn/,
  );
  assert.throws(
    () =>
      parseHuntingGroundSpawns({
        ...options,
        document: {
          ...document,
          grounds: [
            {
              ...document.grounds[0],
              positions: [
                { x: 95, y: 101, z: 7 },
                { x: 102, y: 102, z: 7 },
              ],
            },
          ],
        },
      }),
    /outside its route/,
  );
});

test("rejects monster types not listed by the matching hunting guide", () => {
  assert.throws(
    () =>
      parseHuntingGroundSpawns({
        ...options,
        knownMonsterTypeIds: ["test-rat", "test-snake", "wrong-monster"],
        document: {
          ...document,
          grounds: [
            {
              ...document.grounds[0],
              monsterTypeIds: ["test-rat", "wrong-monster"],
            },
          ],
        },
      }),
    /absent from its hunting guide/,
  );
});
