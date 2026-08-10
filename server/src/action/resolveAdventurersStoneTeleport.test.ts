import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ADVENTURERS_STONE_TEMPLES,
  GUILD_AREA,
  GUILD_ARRIVAL,
} from "./adventurersStoneTables";
import { resolveAdventurersStoneTeleport } from "./resolveAdventurersStoneTeleport";

const THAIS_TEMPLE = { x: 32369, y: 32241, z: 7 };
const FALLBACK = { x: 32069, y: 31901, z: 6 };

const resolve = (
  overrides: Partial<Parameters<typeof resolveAdventurersStoneTeleport>[0]>,
) =>
  resolveAdventurersStoneTeleport({
    position: THAIS_TEMPLE,
    inProtectionZone: true,
    inHouse: false,
    pzLocked: false,
    storedTownId: -1,
    homeTownId: 8,
    fallbackTemple: FALLBACK,
    ...overrides,
  });

describe("resolveAdventurersStoneTeleport", () => {
  it("teleports to the guild from inside a temple box", () => {
    expect(resolve({})).toEqual({
      kind: "to-guild",
      townId: 8,
      destination: GUILD_ARRIVAL,
    });
  });

  it("matches Canary's inclusive box corners", () => {
    expect(resolve({ position: { x: 32358, y: 31777, z: 7 } })).toMatchObject({
      kind: "to-guild",
      townId: 6,
    });
    expect(resolve({ position: { x: 32364, y: 31787, z: 7 } })).toMatchObject({
      kind: "to-guild",
      townId: 6,
    });
    expect(resolve({ position: { x: 32365, y: 31788, z: 7 } })).toEqual({
      kind: "refuse",
    });
  });

  it("refuses outside a protection zone, in a house, or pz-locked", () => {
    expect(resolve({ inProtectionZone: false })).toEqual({ kind: "refuse" });
    expect(resolve({ inHouse: true })).toEqual({ kind: "refuse" });
    expect(resolve({ pzLocked: true })).toEqual({ kind: "refuse" });
  });

  it("refuses in a protection zone that is neither temple nor guild", () => {
    expect(resolve({ position: { x: 32000, y: 32000, z: 7 } })).toEqual({
      kind: "refuse",
    });
  });

  it("returns from the guild to the stored town's temple", () => {
    expect(
      resolve({ position: GUILD_ARRIVAL, storedTownId: 6 }),
    ).toEqual({
      kind: "to-temple",
      destination: { x: 32360, y: 31782, z: 7 },
    });
  });

  it("falls back to the home town temple, then the world temple", () => {
    expect(resolve({ position: GUILD_ARRIVAL, homeTownId: 8 })).toEqual({
      kind: "to-temple",
      destination: THAIS_TEMPLE,
    });
    expect(resolve({ position: GUILD_ARRIVAL, homeTownId: 1 })).toEqual({
      kind: "to-temple",
      destination: FALLBACK,
    });
  });

  it("keeps every table temple inside its own box and on the real map town", () => {
    const map = JSON.parse(
      readFileSync(new URL("../../data/otservbr.map.json", import.meta.url), "utf8"),
    ) as { towns: Array<{ id: number; x: number; y: number; z: number }> };

    for (const entry of ADVENTURERS_STONE_TEMPLES) {
      const town = map.towns.find((candidate) => candidate.id === entry.townId);
      expect(town, `town ${entry.townId}`).toBeDefined();
      expect(entry.temple).toEqual({ x: town?.x, y: town?.y, z: town?.z });
      expect(entry.temple.x).toBeGreaterThanOrEqual(entry.from.x);
      expect(entry.temple.x).toBeLessThanOrEqual(entry.to.x);
      expect(entry.temple.y).toBeGreaterThanOrEqual(entry.from.y);
      expect(entry.temple.y).toBeLessThanOrEqual(entry.to.y);
      expect(entry.temple.z).toBe(entry.from.z);
    }
    expect(ADVENTURERS_STONE_TEMPLES).toHaveLength(17);
    expect(GUILD_ARRIVAL.x).toBeGreaterThanOrEqual(GUILD_AREA.from.x);
    expect(GUILD_ARRIVAL.x).toBeLessThanOrEqual(GUILD_AREA.to.x);
    expect(GUILD_ARRIVAL.y).toBeGreaterThanOrEqual(GUILD_AREA.from.y);
    expect(GUILD_ARRIVAL.y).toBeLessThanOrEqual(GUILD_AREA.to.y);
  });
});
