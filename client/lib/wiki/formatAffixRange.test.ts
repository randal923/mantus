import { describe, expect, it } from "vitest";
import { formatAffixRange } from "./formatAffixRange";
import { WIKI_AFFIX_GUIDE } from "./wikiAffixGuide";

function entryById(id: string) {
  const entry = WIKI_AFFIX_GUIDE.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`missing affix guide entry: ${id}`);
  return entry;
}

describe("formatAffixRange", () => {
  it("shows the base band at uncommon", () => {
    expect(formatAffixRange(entryById("maxHealth"), 1)).toBe("+15–40");
  });

  it("appends % to percent affixes", () => {
    expect(formatAffixRange(entryById("attackSpeed"), 1)).toBe("+3–8%");
  });

  it("rounds like the server after scaling", () => {
    expect(formatAffixRange(entryById("maxMana"), 2.25)).toBe("+45–113");
    expect(formatAffixRange(entryById("critDamage"), 1.5)).toBe("+8–23%");
  });

  it("collapses a flat band to a single value", () => {
    expect(formatAffixRange(entryById("magicLevel"), 1.5)).toBe("+2");
  });
});
