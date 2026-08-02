import { describe, expect, it } from "vitest";
import { insertWaypointAt } from "./insertWaypointAt";

const at = (x: number, y: number, z = 7) => ({ x, y, z });

describe("insertWaypointAt", () => {
  it("bends the leg the click landed nearest to", () => {
    const ring = [at(0, 0), at(10, 0), at(10, 10)];

    expect(insertWaypointAt(ring, at(5, 1))).toEqual([
      at(0, 0),
      at(5, 1),
      at(10, 0),
      at(10, 10),
    ]);
  });

  it("can insert into the closing leg of the ring", () => {
    const ring = [at(0, 0), at(10, 0), at(10, 10)];

    expect(insertWaypointAt(ring, at(4, 6))).toEqual([
      at(0, 0),
      at(10, 0),
      at(10, 10),
      at(4, 6),
    ]);
  });

  it("appends when the route has nothing to bend yet", () => {
    expect(insertWaypointAt([], at(3, 3))).toEqual([at(3, 3)]);
    expect(insertWaypointAt([at(1, 1)], at(3, 3))).toEqual([at(1, 1), at(3, 3)]);
  });

  it("ignores legs drawn on another floor", () => {
    const ring = [at(0, 0, 6), at(10, 0, 6), at(20, 20, 7), at(30, 20, 7)];

    // The click sits right on the z6 leg but belongs to floor 7, so it bends
    // the floor-7 leg instead.
    expect(insertWaypointAt(ring, at(5, 0, 7))).toEqual([
      at(0, 0, 6),
      at(10, 0, 6),
      at(20, 20, 7),
      at(5, 0, 7),
      at(30, 20, 7),
    ]);
  });
});
