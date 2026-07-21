import { boatTravelRoutes } from "./boatTravelRoutes";
import type {
  DialogueChoiceDefinition,
  DialogueGraph,
  DialogueNode,
  NpcTravelOffer,
} from "./DialogueGraph";
import { findDialogueNode } from "./findDialogueNode";

const PROMPT_NODE_ID = "boat-travel";
const DECLINE_NODE_ID = "boat-decline";
const MAX_ROUTE_CHOICES = 15;
const IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TRAVEL_PROMPT_KEYWORDS = new Set([
  "destination",
  "go",
  "passage",
  "route",
  "sail",
  "town",
  "travel",
  "trip",
]);

export function withBoatTravelRoutes(
  graphs: ReadonlyMap<string, DialogueGraph>,
  expectedCanaryCommit: string,
): ReadonlyMap<string, DialogueGraph> {
  if (boatTravelRoutes.canaryCommit !== expectedCanaryCommit) {
    throw new Error("boat travel content does not match creature content");
  }
  const result = new Map(graphs);
  const seenTypeIds = new Set<string>();

  for (const definition of boatTravelRoutes.definitions) {
    if (seenTypeIds.has(definition.typeId)) {
      throw new Error(`duplicate boat travel definition ${definition.typeId}`);
    }
    seenTypeIds.add(definition.typeId);
    if (
      definition.offers.length === 0 ||
      definition.offers.length > MAX_ROUTE_CHOICES
    ) {
      throw new Error(`${definition.typeId} has an invalid boat route count`);
    }
    const graph = result.get(definition.typeId);
    if (!graph) {
      throw new Error(`boat travel references missing NPC ${definition.typeId}`);
    }
    if (graph.travelOffers.length > 0) {
      throw new Error(`${definition.typeId} already has travel offers`);
    }
    const root = findDialogueNode(graph, graph.rootNodeId);
    if (!root) throw new Error(`${definition.typeId} has no dialogue root`);

    const offerIds = new Set<string>();
    const existingNodeIds = new Set(graph.nodes.map((node) => node.id));
    for (const reservedId of [PROMPT_NODE_ID, DECLINE_NODE_ID]) {
      if (existingNodeIds.has(reservedId)) {
        throw new Error(`${definition.typeId} already uses ${reservedId}`);
      }
    }
    for (const offer of definition.offers) {
      if (!IDENTIFIER.test(offer.id) || offerIds.has(offer.id)) {
        throw new Error(`${definition.typeId} has an invalid boat route id`);
      }
      offerIds.add(offer.id);
      for (const nodeId of offerNodeIds(offer.id)) {
        if (existingNodeIds.has(nodeId)) {
          throw new Error(`${definition.typeId} already uses ${nodeId}`);
        }
      }
    }

    const offerChoices = definition.offers.map((offer) => ({
      nodeId: offerNodeIds(offer.id)[0],
      label: offer.label,
    }));
    const rootChoices = root.choices.filter(
      (choice) => !isTravelPromptChoice(graph, choice),
    );
    const nextRoot: DialogueNode = {
      ...root,
      children: [
        PROMPT_NODE_ID,
        ...offerChoices.map((choice) => choice.nodeId),
        ...root.children,
      ],
      choices: [
        { nodeId: PROMPT_NODE_ID, label: "Sail" },
        ...rootChoices,
      ].slice(0, MAX_ROUTE_CHOICES),
    };
    const routeNodes = definition.offers.flatMap((offer) =>
      makeOfferNodes(offer),
    );
    const promptNode: DialogueNode = {
      id: PROMPT_NODE_ID,
      matches: [...TRAVEL_PROMPT_KEYWORDS].map((keyword) => [keyword]),
      responses: ["Where do you want to go?"],
      children: offerChoices.map((choice) => choice.nodeId),
      choices: offerChoices,
    };
    const declineNode: DialogueNode = {
      id: DECLINE_NODE_ID,
      matches: [["no"]],
      responses: ["We would like to serve you some time."],
      children: [],
      choices: [],
      nextNodeId: graph.rootNodeId,
    };
    const travelOffers = definition.offers.map((offer): NpcTravelOffer => ({
      id: offer.id,
      cost: offer.cost,
      destination: offer.destination,
      ...(offer.diversion ? { diversion: offer.diversion } : {}),
      ...(offer.minimumLevel !== undefined
        ? { minimumLevel: offer.minimumLevel }
        : {}),
    }));

    result.set(definition.typeId, {
      ...graph,
      nodes: [
        ...graph.nodes.map((node) => node.id === root.id ? nextRoot : node),
        promptNode,
        ...routeNodes,
        declineNode,
      ],
      travelOffers,
    });
  }

  return result;
}

function isTravelPromptChoice(
  graph: DialogueGraph,
  choice: DialogueChoiceDefinition,
): boolean {
  const node = findDialogueNode(graph, choice.nodeId);
  return node?.matches.some(
    (keywords) => keywords.length === 1 &&
      TRAVEL_PROMPT_KEYWORDS.has(keywords[0]?.toLowerCase() ?? ""),
  ) ?? false;
}

function makeOfferNodes(
  offer: (typeof boatTravelRoutes)["definitions"][number]["offers"][number],
): DialogueNode[] {
  const [offerNodeId, confirmNodeId] = offerNodeIds(offer.id);
  return [
    {
      id: offerNodeId,
      matches: (offer.keywords ?? [offer.label]).map((keyword) => [keyword]),
      responses: [
        offer.response ??
          `Do you seek a passage to ${offer.label} for |TRAVELCOST|?`,
      ],
      children: [confirmNodeId, DECLINE_NODE_ID],
      choices: [
        { nodeId: confirmNodeId, label: "Yes" },
        { nodeId: DECLINE_NODE_ID, label: "No" },
      ],
      offerId: offer.id,
    },
    {
      id: confirmNodeId,
      matches: [["yes"]],
      responses: ["Set the sails!"],
      children: [],
      choices: [],
      action: { kind: "travel", offerId: offer.id },
    },
  ];
}

function offerNodeIds(offerId: string): [string, string] {
  return [`boat-offer-${offerId}`, `boat-confirm-${offerId}`];
}
