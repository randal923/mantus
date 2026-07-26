import { carpetTravelRoutes } from "./carpetTravelRoutes";
import type {
  DialogueGraph,
  DialogueNode,
  NpcTravelOffer,
} from "./DialogueGraph";
import { findDialogueNode } from "./findDialogueNode";

const DECLINE_NODE_ID = "carpet-decline";
const MAX_ROUTE_CHOICES = 15;
const IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/**
 * Keywords whose imported answer is the pilot's "I can fly you to ..." list.
 * Those nodes get the route buttons. The routes also hang off the graph root,
 * because Canary registers every destination as a top-level keyword — naming
 * one has to work anywhere in the conversation, not only after asking to fly.
 */
const ROUTE_LIST_KEYWORDS = new Set([
  "destination",
  "fly",
  "go",
  "passage",
  "ride",
  "route",
  "sail",
  "service",
  "town",
  "transport",
  "trip",
]);

export function withCarpetTravelRoutes(
  graphs: ReadonlyMap<string, DialogueGraph>,
  expectedCanaryCommit: string,
): ReadonlyMap<string, DialogueGraph> {
  if (carpetTravelRoutes.canaryCommit !== expectedCanaryCommit) {
    throw new Error("carpet travel content does not match creature content");
  }
  const result = new Map(graphs);
  const seenTypeIds = new Set<string>();

  for (const definition of carpetTravelRoutes.definitions) {
    if (seenTypeIds.has(definition.typeId)) {
      throw new Error(`duplicate carpet travel definition ${definition.typeId}`);
    }
    seenTypeIds.add(definition.typeId);
    if (
      definition.offers.length === 0 ||
      definition.offers.length > MAX_ROUTE_CHOICES
    ) {
      throw new Error(`${definition.typeId} has an invalid carpet route count`);
    }
    const graph = result.get(definition.typeId);
    if (!graph) {
      throw new Error(
        `carpet travel references missing NPC ${definition.typeId}`,
      );
    }
    if (graph.travelOffers.length > 0) {
      throw new Error(`${definition.typeId} already has travel offers`);
    }
    const root = findDialogueNode(graph, graph.rootNodeId);
    if (!root) throw new Error(`${definition.typeId} has no dialogue root`);

    const existingNodeIds = new Set(graph.nodes.map((node) => node.id));
    if (existingNodeIds.has(DECLINE_NODE_ID)) {
      throw new Error(`${definition.typeId} already uses ${DECLINE_NODE_ID}`);
    }
    const offerIds = new Set<string>();
    for (const offer of definition.offers) {
      if (!IDENTIFIER.test(offer.id) || offerIds.has(offer.id)) {
        throw new Error(`${definition.typeId} has an invalid carpet route id`);
      }
      offerIds.add(offer.id);
      for (const nodeId of offerNodeIds(offer.id)) {
        if (existingNodeIds.has(nodeId)) {
          throw new Error(`${definition.typeId} already uses ${nodeId}`);
        }
      }
      // A route keyword the import already answers with flavour text would be
      // shadowed by the ride, silently losing that line.
      for (const keyword of offer.keywords) {
        if (graph.nodes.some((node) => matchesExactly(node, keyword))) {
          throw new Error(
            `${definition.typeId} already answers ${keyword}`,
          );
        }
      }
    }

    const choices = definition.offers.map((offer) => ({
      nodeId: offerNodeIds(offer.id)[0],
      label: offer.label,
    }));
    const routeNodeIds = choices.map((choice) => choice.nodeId);
    const nodes = graph.nodes.map((node) => {
      if (node.id === root.id) {
        return { ...node, children: [...routeNodeIds, ...node.children] };
      }
      if (!listsRoutes(node)) return node;
      return {
        ...node,
        children: [...routeNodeIds, ...node.children],
        choices: [...choices, ...node.choices].slice(0, MAX_ROUTE_CHOICES),
      };
    });
    const declineNode: DialogueNode = {
      id: DECLINE_NODE_ID,
      matches: [["no"]],
      responses: [definition.declineResponse],
      children: [],
      choices: [],
      nextNodeId: graph.rootNodeId,
    };

    result.set(definition.typeId, {
      ...graph,
      nodes: [
        ...nodes,
        ...definition.offers.flatMap((offer) =>
          makeOfferNodes(definition.confirmResponse, offer),
        ),
        declineNode,
      ],
      travelOffers: definition.offers.map((offer): NpcTravelOffer => ({
        id: offer.id,
        cost: offer.cost,
        destination: offer.destination,
        ...(offer.minimumLevel !== undefined
          ? { minimumLevel: offer.minimumLevel }
          : {}),
        ...(offer.conditions ? { conditions: offer.conditions } : {}),
      })),
    });
  }

  return result;
}

function listsRoutes(node: DialogueNode): boolean {
  return node.matches.some(
    (keywords) =>
      keywords.length === 1 &&
      ROUTE_LIST_KEYWORDS.has(keywords[0]?.toLowerCase() ?? ""),
  );
}

function matchesExactly(node: DialogueNode, keyword: string): boolean {
  return node.matches.some(
    (keywords) =>
      keywords.length === 1 &&
      keywords[0]?.toLowerCase() === keyword.toLowerCase(),
  );
}

function makeOfferNodes(
  confirmResponse: string,
  offer: (typeof carpetTravelRoutes)["definitions"][number]["offers"][number],
): DialogueNode[] {
  const [offerNodeId, confirmNodeId] = offerNodeIds(offer.id);
  return [
    {
      id: offerNodeId,
      matches: offer.keywords.map((keyword) => [keyword]),
      responses: [offer.response],
      children: [confirmNodeId, DECLINE_NODE_ID],
      choices: [
        { nodeId: confirmNodeId, label: "Yes" },
        { nodeId: DECLINE_NODE_ID, label: "No" },
      ],
      offerId: offer.id,
      // Also on the branch, so a gated ride is refused when it is asked for
      // and not only when the fare is charged.
      ...(offer.conditions ? { conditions: offer.conditions } : {}),
    },
    {
      id: confirmNodeId,
      matches: [["yes"]],
      responses: [confirmResponse],
      children: [],
      choices: [],
      action: { kind: "travel", offerId: offer.id },
    },
  ];
}

function offerNodeIds(offerId: string): [string, string] {
  return [`carpet-offer-${offerId}`, `carpet-confirm-${offerId}`];
}
