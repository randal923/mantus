import { describe, expect, it } from "vitest";
import { loadCreatureContent } from "./loadCreatureContent";

/**
 * The typed NpcType surface (Feature 37). Every behavior field the pinned
 * Canary definitions declare is carried typed and validated by the loader —
 * an untyped field would show up as a parity gap in the creature import
 * report instead of silently vanishing.
 */
describe("typed NpcType model", () => {
  const content = loadCreatureContent("world", "otservbr");

  it("carries speech triggers, profession, bubble, and leash behavior", () => {
    expect(content.npcTypes.get("a-bearded-woman")).toMatchObject({
      name: "A Bearded Woman",
      description: "A Bearded Woman",
      profession: "trader",
      speechBubble: "trade",
      canChangeFloor: false,
      walkRadius: 2,
      walkIntervalMs: 2_000,
    });
    const voices = content.npcTypes.get("a-bearded-woman")?.voices ?? [];
    expect(voices).toHaveLength(7);
    expect(voices[0]).toEqual({
      text: "I am a MAN! Get me out you drunken fools!",
      intervalMs: 15_000,
      chance: 50,
      yell: false,
    });
  });

  it("resolves the shop catalog each shopkeeper owns", () => {
    for (const catalog of content.shopCatalogs.values()) {
      expect(content.npcTypes.get(catalog.npcTypeId)?.shopId).toBe(catalog.id);
    }
    const shopkeepers = [...content.npcTypes.values()].filter(
      (type) => type.shopId !== undefined,
    );
    expect(shopkeepers).toHaveLength(content.shopCatalogs.size);
  });

  it("types every profession and speech bubble the world uses", () => {
    const professions = new Set(
      [...content.npcTypes.values()].map((type) => type.profession),
    );
    const bubbles = new Set(
      [...content.npcTypes.values()].map((type) => type.speechBubble),
    );
    expect([...professions].sort()).toEqual([
      "banker",
      "king",
      "normal",
      "queen",
      "sailor",
      "trader",
    ]);
    expect([...bubbles].sort()).toEqual([
      "banker",
      "none",
      "normal",
      "sailor",
      "trade",
    ]);
  });

  it("keeps the dialogue graph and its travel offers on the type", () => {
    const captain = content.npcTypes.get("captain-bluebear");
    expect(captain?.dialogue?.travelOffers.length).toBeGreaterThan(0);
    for (const offer of captain?.dialogue?.travelOffers ?? []) {
      expect(offer.cost).toBeGreaterThanOrEqual(0);
      expect(offer.destination.z).toBeLessThanOrEqual(15);
    }
  });
});
