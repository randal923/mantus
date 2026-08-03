import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getSpellIconArtwork } from "./getSpellIconArtwork";

const SPELL_CATALOG_URL = new URL(
  "../../../content/spells/canary-spells.json",
  import.meta.url,
);

function castableSpellIds(): ReadonlyArray<string> {
  const catalog: unknown = JSON.parse(readFileSync(SPELL_CATALOG_URL, "utf8"));
  const { spells } = catalog as {
    spells: ReadonlyArray<{ id: string; supported: boolean }>;
  };
  return spells.filter((spell) => spell.supported).map((spell) => spell.id);
}

describe("getSpellIconArtwork", () => {
  it("maps modern spells to the current OTClient sheet", () => {
    expect(getSpellIconArtwork("exura-infir-ico")).toEqual({
      kind: "sheet",
      sheet: "current",
      index: 134,
    });
    expect(getSpellIconArtwork("exori-infir-min")).toEqual({
      kind: "sheet",
      sheet: "current",
      index: 160,
    });
    expect(getSpellIconArtwork("exura-tio-sio")).toEqual({
      kind: "sheet",
      sheet: "current",
      index: 185,
    });
    expect(getSpellIconArtwork("exani-tera")).toEqual({
      kind: "sheet",
      sheet: "current",
      index: 104,
    });
  });

  it("maps rune entries to their OTClient spell icons", () => {
    expect(getSpellIconArtwork("avalanche-rune")).toEqual({
      kind: "sheet",
      sheet: "current",
      index: 91,
    });
    expect(getSpellIconArtwork("adori-infir-mas-tera")).toEqual({
      kind: "sheet",
      sheet: "current",
      index: 64,
    });
  });

  it("keeps retired conjure icons on the legacy sheet", () => {
    expect(getSpellIconArtwork("exevo-con-pox")).toEqual({
      kind: "sheet",
      sheet: "legacy",
      index: 110,
    });
  });

  it("draws the conjured item when OTClient ships no spell icon", () => {
    expect(getSpellIconArtwork("adori-blank")).toEqual({
      kind: "item",
      clientId: 3147,
      spriteId: 7614,
    });
    expect(getSpellIconArtwork("exevo-gran-con-grav")).toEqual({
      kind: "item",
      clientId: 25_759,
      spriteId: 24_886,
    });
  });

  it("gives every castable spell an icon", () => {
    const ids = castableSpellIds();

    expect(ids).toHaveLength(169);
    expect(ids.filter((id) => !getSpellIconArtwork(id))).toEqual([]);
  });

  it("keeps every icon inside its sheet", () => {
    const outOfRange = castableSpellIds().filter((id) => {
      const artwork = getSpellIconArtwork(id);
      if (artwork?.kind !== "sheet") return false;
      const lastIndex = artwork.sheet === "current" ? 186 : 131;
      return artwork.index < 0 || artwork.index > lastIndex;
    });

    expect(outOfRange).toEqual([]);
  });
});
