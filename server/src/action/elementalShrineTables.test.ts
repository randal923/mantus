import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ELEMENTAL_SHRINE_DESTINATIONS,
  ELEMENTAL_SHRINE_ENTRANCES,
  ELEMENTAL_SHRINE_EXITS,
  ELEMENTAL_SHRINE_RETURNS,
} from "./elementalShrineTables";
import { positionKey } from "../positionKey";
import { readMapWalkability } from "../readMapWalkability";

// The shrine flames carry no OTBM destination, so nothing else in the pipeline
// checks these coordinates. A typo would silently produce a dead portal or a
// teleport the server swallows, which is the bug class this table fixes.

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data");
const tileAt = readMapWalkability(join(dataDir, "otservbr.map.bin"));

describe("elemental shrine tables", () => {
  it("has one flame per element in each of the thirteen cities", () => {
    expect(ELEMENTAL_SHRINE_ENTRANCES).toHaveLength(52);
    for (const element of ["ice", "earth", "fire", "energy"] as const) {
      const cities = ELEMENTAL_SHRINE_ENTRANCES.filter(
        (entrance) => entrance.element === element,
      ).map((entrance) => entrance.cityIndex);
      expect([...cities].sort((a, b) => a - b)).toEqual(
        ELEMENTAL_SHRINE_RETURNS.map((_, index) => index + 1),
      );
    }
  });

  it("never lists the same tile twice", () => {
    const keys = [
      ...ELEMENTAL_SHRINE_ENTRANCES.map((entrance) =>
        positionKey(entrance.position),
      ),
      ...ELEMENTAL_SHRINE_EXITS.map(positionKey),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("stands on walkable tiles and lands on walkable tiles", () => {
    const blocked = [
      ...ELEMENTAL_SHRINE_ENTRANCES.map((entrance) => entrance.position),
      ...ELEMENTAL_SHRINE_EXITS,
      ...ELEMENTAL_SHRINE_RETURNS,
      ...Object.values(ELEMENTAL_SHRINE_DESTINATIONS),
    ].filter((position) => tileAt(position) !== "walkable");
    expect(blocked).toEqual([]);
  });
});
