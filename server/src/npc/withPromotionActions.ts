import type { DialogueGraph, DialogueNode } from "./DialogueGraph";

const PROMOTION_NPC_IDS = [
  "emperor-kruzak",
  "emperor-rehal",
  "ishebad",
  "king-tibianus",
  "queen-eloise",
] as const;
const CONFIRM_NODE_ID = "promotion-confirm";
const COST = 20_000;
const MINIMUM_LEVEL = 20;

export function withPromotionActions(
  graphs: ReadonlyMap<string, DialogueGraph>,
): ReadonlyMap<string, DialogueGraph> {
  const result = new Map(graphs);
  for (const typeId of PROMOTION_NPC_IDS) {
    const graph = result.get(typeId);
    if (!graph) throw new Error(`promotion references missing NPC ${typeId}`);
    if (graph.nodes.some((node) => node.id === CONFIRM_NODE_ID)) {
      throw new Error(`${typeId} already uses ${CONFIRM_NODE_ID}`);
    }
    const prompt = graph.nodes.find((node) =>
      node.matches.some((keywords) =>
        keywords.some((keyword) => keyword.toLowerCase().includes("promot")),
      ),
    );
    if (!prompt) throw new Error(`${typeId} has no promotion prompt`);
    const confirmation: DialogueNode = {
      id: CONFIRM_NODE_ID,
      matches: [["yes"]],
      responses: ["Congratulations! You are now promoted."],
      children: [],
      choices: [],
      nextNodeId: graph.rootNodeId,
      action: { kind: "promote", cost: COST, minimumLevel: MINIMUM_LEVEL },
    };
    result.set(typeId, {
      ...graph,
      nodes: [
        ...graph.nodes.map((node): DialogueNode =>
          node.id === prompt.id
            ? {
                ...node,
                matches: [["promotion"], ["promote"], ...node.matches],
                children: [CONFIRM_NODE_ID, ...node.children],
                choices: [
                  { nodeId: CONFIRM_NODE_ID, label: "Yes" },
                  ...node.choices,
                ],
              }
            : node,
        ),
        confirmation,
      ],
    });
  }
  return result;
}
