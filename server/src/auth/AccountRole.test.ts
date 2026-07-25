import { describe, expect, it } from "vitest";
import {
  ACCOUNT_ROLES,
  capabilitiesFor,
  hasCapability,
  isAccountRole,
  type AccountRole,
} from "./AccountRole";

describe("account roles (Feature 96)", () => {
  it("grants a plain player nothing", () => {
    expect(capabilitiesFor("player")).toEqual([]);
    expect(hasCapability("player", "moderate.mute")).toBe(false);
    expect(hasCapability("player", "world.inspect")).toBe(false);
  });

  it("keeps the tutor short of removing anyone from the game", () => {
    expect(hasCapability("tutor", "moderate.mute")).toBe(true);
    expect(hasCapability("tutor", "moderate.note")).toBe(true);
    expect(hasCapability("tutor", "world.inspect")).toBe(true);
    expect(hasCapability("tutor", "moderate.kick")).toBe(false);
    expect(hasCapability("tutor", "moderate.ban")).toBe(false);
    expect(hasCapability("tutor", "moderate.namelock")).toBe(false);
    expect(hasCapability("tutor", "world.teleport")).toBe(false);
  });

  it("gives the gamemaster the full moderation and world surface", () => {
    for (const capability of [
      "moderate.mute",
      "moderate.note",
      "moderate.kick",
      "moderate.ban",
      "moderate.namelock",
      "world.teleport",
      "world.inspect",
    ] as const) {
      expect(hasCapability("gamemaster", capability)).toBe(true);
    }
  });

  it("fails closed for an unknown or missing role", () => {
    expect(hasCapability(undefined, "moderate.mute")).toBe(false);
    expect(hasCapability("archmage" as AccountRole, "moderate.mute")).toBe(
      false,
    );
    expect(hasCapability("" as AccountRole, "world.inspect")).toBe(false);
  });

  it("recognizes exactly the declared roles", () => {
    for (const role of ACCOUNT_ROLES) expect(isAccountRole(role)).toBe(true);
    for (const value of ["archmage", "", null, undefined, 3, {}]) {
      expect(isAccountRole(value)).toBe(false);
    }
  });

  it("never lets a lower role hold a capability a higher one lacks", () => {
    // The ladder is only meaningful if it is monotonic; a gap here would mean
    // promoting somebody could silently take a power away.
    const ladder: readonly AccountRole[] = [
      "player",
      "tutor",
      "gamemaster",
      "admin",
    ];
    for (let index = 1; index < ladder.length; index += 1) {
      const lower = new Set(capabilitiesFor(ladder[index - 1]!));
      const higher = new Set(capabilitiesFor(ladder[index]!));
      for (const capability of lower) {
        expect(
          higher.has(capability),
          `${ladder[index]} lacks ${capability} held by ${ladder[index - 1]}`,
        ).toBe(true);
      }
    }
  });
});
