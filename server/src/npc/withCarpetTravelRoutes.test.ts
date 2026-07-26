import { describe, expect, it } from "vitest";
import { carpetTravelRoutes } from "./carpetTravelRoutes";
import type { DialogueGraph, DialogueNode } from "./DialogueGraph";
import { withCarpetTravelRoutes } from "./withCarpetTravelRoutes";

const CANARY_COMMIT = "a879c9312e34381e8eedf397b8ed44510698b689";
const FIRST = carpetTravelRoutes.definitions[0];
if (!FIRST) throw new Error("carpet travel content has no definitions");
const FIRST_KEYWORD = FIRST.offers[0]?.keywords[0];
if (!FIRST_KEYWORD) throw new Error("carpet travel content has no keywords");
const FIRST_TYPE_ID = FIRST.typeId;

function graphWith(nodes: ReadonlyArray<DialogueNode>): DialogueGraph {
  return {
    talkRange: 4,
    timeoutMs: 30_000,
    greetingKeywords: ["hi"],
    farewellKeywords: ["bye"],
    greeting: ["Hello."],
    farewell: ["Bye."],
    walkAway: ["Bye."],
    rootNodeId: "root",
    nodes: [
      { id: "root", matches: [], responses: [], children: [], choices: [] },
      ...nodes,
    ],
    travelOffers: [],
  };
}

/**
 * The merge walks every definition, so the other pilots need a graph too;
 * only the one under test carries the case's nodes.
 */
function graft(graph: DialogueGraph): ReadonlyMap<string, DialogueGraph> {
  return withCarpetTravelRoutes(
    new Map(
      carpetTravelRoutes.definitions.map((definition) => [
        definition.typeId,
        definition.typeId === FIRST_TYPE_ID ? graph : graphWith([]),
      ]),
    ),
    CANARY_COMMIT,
  );
}

describe("withCarpetTravelRoutes", () => {
  it("refuses content pinned to a different Canary commit", () => {
    expect(() => graft(graphWith([]))).not.toThrow();
    expect(() => withCarpetTravelRoutes(new Map(), "other")).toThrow(
      "does not match creature content",
    );
  });

  it("refuses to graft onto an NPC the content does not describe", () => {
    expect(() => withCarpetTravelRoutes(new Map(), CANARY_COMMIT)).toThrow(
      "references missing NPC",
    );
  });

  it("refuses to double up on routes the import already produced", () => {
    const graph = graphWith([]);
    expect(() =>
      graft({
        ...graph,
        travelOffers: [
          { id: "edron", cost: 1, destination: { x: 1, y: 2, z: 3 } },
        ],
      }),
    ).toThrow("already has travel offers");
  });

  it("refuses to shadow a keyword the import already answers", () => {
    // A ride registered over an imported keyword would silently swallow that
    // node's line, because the routes sit ahead of it under the root.
    expect(() =>
      graft(
        graphWith([
          {
            id: "flavour",
            matches: [[FIRST_KEYWORD]],
            responses: ["Imported flavour."],
            children: [],
            choices: [],
          },
        ]),
      ),
    ).toThrow(`already answers ${FIRST_KEYWORD}`);
  });

  it("hangs routes off the root and lists them on the pilot's answer", () => {
    const grafted = graft(
      graphWith([
        {
          id: "fly",
          matches: [["fly"]],
          responses: ["I can fly you to ..."],
          children: [],
          choices: [],
        },
      ]),
    ).get(FIRST_TYPE_ID);
    const root = grafted?.nodes.find((node) => node.id === "root");
    const prompt = grafted?.nodes.find((node) => node.id === "fly");

    expect(grafted?.travelOffers).toHaveLength(FIRST.offers.length);
    // Reachable by naming a destination anywhere, and clickable off the list.
    for (const offer of FIRST.offers) {
      expect(root?.children).toContain(`carpet-offer-${offer.id}`);
      expect(prompt?.children).toContain(`carpet-offer-${offer.id}`);
    }
    expect(prompt?.choices).toHaveLength(FIRST.offers.length);
    // The root keeps the imported buttons; only the route list gains any.
    expect(root?.choices).toEqual([]);
  });
});
