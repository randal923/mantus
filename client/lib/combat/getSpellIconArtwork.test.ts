import { describe, expect, it } from "vitest";
import { getSpellIconArtwork } from "./getSpellIconArtwork";

describe("getSpellIconArtwork", () => {
  it("maps modern spells to the current OTClient sheet", () => {
    expect(getSpellIconArtwork("exura-infir-ico")).toEqual({
      sheet: "current",
      index: 134,
    });
    expect(getSpellIconArtwork("exori-infir-min")).toEqual({
      sheet: "current",
      index: 160,
    });
    expect(getSpellIconArtwork("exura-tio-sio")).toEqual({
      sheet: "current",
      index: 185,
    });
  });

  it("maps rune entries to their OTClient spell icons", () => {
    expect(getSpellIconArtwork("avalanche-rune")).toEqual({
      sheet: "current",
      index: 91,
    });
    expect(getSpellIconArtwork("adori-infir-mas-tera")).toEqual({
      sheet: "current",
      index: 64,
    });
  });

  it("keeps retired conjure icons on the legacy sheet", () => {
    expect(getSpellIconArtwork("exevo-con-pox")).toEqual({
      sheet: "legacy",
      index: 110,
    });
  });

  it("returns undefined when OTClient provides no spell icon", () => {
    expect(getSpellIconArtwork("adori-blank")).toBeUndefined();
    expect(getSpellIconArtwork("exevo-gran-con-grav")).toBeUndefined();
  });
});
