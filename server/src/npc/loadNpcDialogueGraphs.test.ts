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
/** The magic-carpet network, whose rides the importer cannot read. */
const CARPET_ROUTE_COUNTS = {
  chemar: 7,
  gewen: 7,
  iyad: 7,
  melian: 7,
  pino: 7,
  tanyt: 7,
  uzon: 7,
  "uzon-back": 1,
  ziyad: 7,
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

  it("flies Chemar's carpet routes and keeps Farmine behind its quest gate", () => {
    const graph = loadNpcDialogueGraphs(CANARY_COMMIT).get("chemar");

    expect(graph).toBeDefined();
    if (!graph) return;
    const prompt = matchNpcDialogueNode(graph, graph.rootNodeId, "fly");
    // Canary registers every destination as a top-level keyword, so asking
    // for one without asking to {fly} first has to work too.
    const edron = matchNpcDialogueNode(graph, graph.rootNodeId, "edron");
    const confirmation = edron
      ? matchNpcDialogueNode(graph, edron.id, "yes")
      : undefined;
    const hills = prompt
      ? matchNpcDialogueNode(graph, prompt.id, "femor hills")
      : undefined;

    expect(prompt?.choices).toHaveLength(7);
    expect(edron?.offerId).toBe("edron");
    expect(confirmation?.action).toEqual({ kind: "travel", offerId: "edron" });
    expect(hills?.offerId).toBe("femor-hills");
    // The alias Canary adds with addAliasKeyword, not just the full name.
    expect(matchNpcDialogueNode(graph, graph.rootNodeId, "kazor")?.offerId)
      .toBe("kazordoon");
    expect(graph.travelOffers).toHaveLength(7);
    expect(graph.travelOffers.find((offer) => offer.id === "issavi")).toEqual({
      id: "issavi",
      cost: 100,
      destination: { x: 33957, y: 31515, z: 0 },
    });

    // The New Frontier gate has to survive the load and sit on the offer, not
    // only on the branch: TravelService re-checks it when the fare is charged.
    const gate = [
      {
        kind: "storage",
        key: "Quest.U8_54.TheNewFrontier.Mission10",
        operator: "eq",
        value: 2,
      },
    ];
    const farmine = matchNpcDialogueNode(graph, graph.rootNodeId, "zao");

    expect(farmine?.offerId).toBe("farmine");
    expect(farmine?.conditions).toEqual(gate);
    expect(graph.travelOffers.find((offer) => offer.id === "farmine")).toEqual({
      id: "farmine",
      cost: 60,
      destination: { x: 32983, y: 31539, z: 1 },
      conditions: gate,
    });
  });

  it("gives every carpet pilot a bookable ride behind its route list", () => {
    const graphs = loadNpcDialogueGraphs(CANARY_COMMIT);

    for (const [typeId, routeCount] of Object.entries(CARPET_ROUTE_COUNTS)) {
      const graph = graphs.get(typeId);
      expect(graph, typeId).toBeDefined();
      if (!graph) continue;
      expect(graph.travelOffers, typeId).toHaveLength(routeCount);

      // Every listed route has to be bookable: reachable by naming it, priced
      // by an offer that exists, and confirmable into a travel action.
      for (const offer of graph.travelOffers) {
        const branch = graph.nodes.find(
          (node) => node.offerId === offer.id,
        );
        const keyword = branch?.matches[0]?.[0];
        const label = `${typeId}/${offer.id}`;
        expect(branch, label).toBeDefined();
        expect(keyword, label).toBeDefined();
        if (!branch || !keyword) continue;
        expect(
          matchNpcDialogueNode(graph, graph.rootNodeId, keyword)?.id,
          label,
        ).toBe(branch.id);
        expect(
          matchNpcDialogueNode(graph, branch.id, "yes")?.action,
          label,
        ).toEqual({ kind: "travel", offerId: offer.id });
        expect(
          matchNpcDialogueNode(graph, branch.id, "no")?.responses.length,
          label,
        ).toBeGreaterThan(0);
      }

      // The pilot's "I can fly you to ..." answer carries the buttons.
      const prompt = matchNpcDialogueNode(graph, graph.rootNodeId, "fly");
      expect(prompt?.choices.length, typeId).toBe(routeCount);
    }

    // Grafting routes on must not shadow the imported flavour. Melian answers
    // for Zao and Farmine but flies to neither, so a ride that swallowed those
    // keywords would silently eat the imported lines.
    const melian = graphs.get("melian");
    const zao = melian
      ? matchNpcDialogueNode(melian, melian.rootNodeId, "zao")
      : undefined;

    expect(zao?.offerId).toBeUndefined();
    expect(zao?.responses[0]).toBe(
      "What a strange and bizarre continent. I'm glad my landing place is far away from all the mess I've seen from above.",
    );
  });

  it("keeps Uzon's Eclipse ride inside The Inquisition's questline window", () => {
    const graph = loadNpcDialogueGraphs(CANARY_COMMIT).get("uzon");
    const eclipse = graph?.travelOffers.find((offer) => offer.id === "eclipse");

    // Canary refuses unless the questline reads 4 or 5. A pair of inclusive
    // bounds is that disjunction, and both have to survive onto the offer or
    // an unholy shortcut opens for everyone.
    expect(eclipse?.conditions).toEqual([
      {
        kind: "storage",
        key: "Quest.U8_2.TheInquisitionQuest.Questline",
        operator: "gte",
        value: 4,
      },
      {
        kind: "storage",
        key: "Quest.U8_2.TheInquisitionQuest.Questline",
        operator: "lte",
        value: 5,
      },
    ]);
    expect(eclipse?.cost).toBe(110);
    expect(eclipse?.destination).toEqual({ x: 32659, y: 31915, z: 0 });
  });

  it("imports the Canary promotion confirmation for all five rulers", () => {
    const graphs = loadNpcDialogueGraphs(CANARY_COMMIT);

    for (const typeId of PROMOTION_NPCS) {
      const graph = graphs.get(typeId);
      // "promot" is the pinned keyword, and Canary's MsgContains needs a
      // whole-word hit — saying "promotion" does not reach this branch there
      // either, so neither does it here.
      const prompt = graph
        ? matchNpcDialogueNode(graph, graph.rootNodeId, "promot")
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

    // 90 reviewed boat routes, 57 reviewed carpet routes, plus the travel and
    // kick destinations the importer derives from the pinned sources.
    expect(offers).toHaveLength(161);
    expect(
      destinations.filter(
        (destination) => !world.findUnoccupiedPosition(destination, 2),
      ),
    ).toEqual([]);
  });
});
