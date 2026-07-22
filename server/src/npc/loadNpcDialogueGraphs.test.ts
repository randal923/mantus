import { describe, expect, it } from "vitest";
import { resolveMapData } from "../resolveMapData";
import { loadCreatureContent } from "../spawn/loadCreatureContent";
import { World } from "../World";
import { loadNpcDialogueGraphs } from "./loadNpcDialogueGraphs";
import { matchNpcDialogueNode } from "./matchNpcDialogueNode";

const CANARY_COMMIT = "a879c9312e34381e8eedf397b8ed44510698b689";
const COASTAL_BOAT_ROUTE_COUNTS = {
  "captain-bluebear": 10,
  "captain-breezelda": 3,
  "captain-chelop": 1,
  "captain-cookie": 1,
  "captain-fearless": 12,
  "captain-greyhound": 5,
  "captain-gulliver": 3,
  "captain-harava": 4,
  "captain-pelagia": 6,
  "captain-seagull": 5,
  "captain-seahorse": 11,
  "captain-sinbeard": 5,
  charles: 7,
  "jack-fate": 6,
  petros: 7,
  scrutinon: 4,
} as const;
const PROMOTION_NPCS = [
  "emperor-kruzak",
  "emperor-rehal",
  "ishebad",
  "king-tibianus",
  "queen-eloise",
] as const;

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
    for (const [typeId, routeCount] of Object.entries(
      COASTAL_BOAT_ROUTE_COUNTS,
    )) {
      expect(graphs.get(typeId)?.travelOffers, typeId).toHaveLength(routeCount);
    }
  });

  it("offers and executes Captain Fearless routes from the dialogue graph", () => {
    const graph = loadNpcDialogueGraphs(CANARY_COMMIT).get("captain-fearless");

    expect(graph).toBeDefined();
    if (!graph) return;
    const prompt = matchNpcDialogueNode(graph, graph.rootNodeId, "sail");
    const darashia = matchNpcDialogueNode(graph, graph.rootNodeId, "darashia");
    const confirmation = darashia
      ? matchNpcDialogueNode(graph, darashia.id, "yes")
      : undefined;

    expect(prompt?.id).toBe("boat-travel");
    expect(prompt?.choices).toHaveLength(12);
    expect(darashia?.offerId).toBe("darashia");
    expect(confirmation?.action).toEqual({
      kind: "travel",
      offerId: "darashia",
    });
    expect(
      graph.travelOffers.find((offer) => offer.id === "darashia"),
    ).toEqual({
      id: "darashia",
      cost: 60,
      destination: { x: 33289, y: 32481, z: 6 },
      diversion: {
        oneIn: 10,
        destination: { x: 33324, y: 32173, z: 6 },
      },
    });
  });

  it("attaches the Canary promotion confirmation to all five rulers", () => {
    const graphs = loadNpcDialogueGraphs(CANARY_COMMIT);

    for (const typeId of PROMOTION_NPCS) {
      const graph = graphs.get(typeId);
      const prompt = graph
        ? matchNpcDialogueNode(graph, graph.rootNodeId, "promotion")
        : undefined;
      const confirmation = prompt
        ? matchNpcDialogueNode(graph!, prompt.id, "yes")
        : undefined;

      expect(prompt?.choices.some((choice) => choice.label === "Yes"), typeId)
        .toBe(true);
      expect(confirmation?.action, typeId).toEqual({
        kind: "promote",
        cost: 20_000,
        minimumLevel: 20,
      });
    }
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
    const destinations = offers.flatMap((offer) => [
      offer.destination,
      ...(offer.diversion ? [offer.diversion.destination] : []),
    ]);

    expect(offers).toHaveLength(90);
    expect(
      destinations.filter(
        (destination) => !world.findUnoccupiedPosition(destination, 2),
      ),
    ).toEqual([]);
  });
});
