import { describe, expect, it } from "vitest";
import { resolveMapData } from "../resolveMapData";
import { loadCreatureContent } from "../spawn/loadCreatureContent";
import { World } from "../World";
import { loadNpcDialogueGraphs } from "./loadNpcDialogueGraphs";

const CANARY_COMMIT = "a879c9312e34381e8eedf397b8ed44510698b689";

describe("loadNpcDialogueGraphs", () => {
  it("loads generated baselines with reviewed server-owned overrides", () => {
    const graphs = loadNpcDialogueGraphs(CANARY_COMMIT);
    const captain = graphs.get("captain-bluebear");

    expect(graphs.size).toBe(949);
    expect(graphs.get("rudolph")?.greeting).toEqual([
      "Oh, a customer. Hello |PLAYERNAME|. If you'd like to see my wonderful self-tailored clothes, ask me for a {trade}.",
    ]);
    expect(
      graphs
        .get("rudolph")
        ?.nodes.some(
          (node) =>
            node.action?.kind === "shop" && node.action.shopId === "rudolph",
        ),
    ).toBe(true);
    expect(
      graphs
        .get("sam")
        ?.nodes.find(
          (node) =>
            node.action?.kind === "shop" && node.action.shopId === "sam",
        ),
    ).toBeDefined();
    expect(
      graphs
        .get("naji")
        ?.nodes.find((node) => node.action?.kind === "bank"),
    ).toBeDefined();
    expect(captain?.travelOffers).toHaveLength(10);
    expect(captain?.travelOffers.find((offer) => offer.id === "carlin")).toEqual({
      id: "carlin",
      cost: 110,
      destination: { x: 32387, y: 31820, z: 6 },
    });
  });

  it("fails closed when dialogue and creature content use different commits", () => {
    expect(() => loadNpcDialogueGraphs("different-commit")).toThrow(
      "does not match creature content",
    );
  });

  it("attaches reviewed dialogue without executing imported Lua", () => {
    const content = loadCreatureContent("world", "otservbr");

    expect(content.npcTypes.size).toBe(956);
    expect(content.npcTypes.get("captain-bluebear")?.dialogue).toBeDefined();
    expect(content.npcTypes.get("quentin")?.dialogue).toBeDefined();
    expect(content.npcTypes.get("a-bearded-woman")?.dialogue).toBeDefined();
    expect(content.npcTypes.get("rudolph")?.dialogue).toBeDefined();
    expect(content.npcTypes.get("an-orc-guard")?.dialogue).toBeUndefined();
  });

  it("resolves every reviewed travel destination on the converted world map", () => {
    const world = new World(
      resolveMapData({ source: "data", name: "otservbr" }),
      25,
    );
    const graphs = loadNpcDialogueGraphs(CANARY_COMMIT);
    const offers = [...graphs.values()].flatMap((graph) => graph.travelOffers);

    expect(offers).toHaveLength(10);
    expect(
      offers.filter(
        (offer) => !world.findUnoccupiedPosition(offer.destination, 2),
      ),
    ).toEqual([]);
  });
});
