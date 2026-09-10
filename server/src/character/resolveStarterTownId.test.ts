import { describe, expect, it } from "vitest";
import { resolveStarterTownId } from "./resolveStarterTownId";

const towns = (entries: ReadonlyArray<{ id: number; name: string }>) => ({
  townId: (name: string) =>
    entries.find((town) => town.name.toLowerCase() === name.toLowerCase())?.id,
});

const WORLD = towns([
  { id: 1, name: "Dawnport Tutorial" },
  { id: 8, name: "Thais" },
]);

describe("resolveStarterTownId", () => {
  it("falls back to Thais when no starter town is configured", () => {
    expect(resolveStarterTownId(undefined, WORLD)).toBe(8);
  });

  it("keeps a configured starter town", () => {
    expect(resolveStarterTownId(1, WORLD)).toBe(1);
  });

  it("refuses to default when the map has no Thais", () => {
    expect(() =>
      resolveStarterTownId(undefined, towns([{ id: 3, name: "Rookgaard" }])),
    ).toThrow(/no town named Thais/);
  });
});
