import type { DialogueGraph, DialogueNode } from "./DialogueGraph";
import { findDialogueNode } from "./findDialogueNode";

const DEPOSIT_NODE_ID = "bank-keyword-deposit";
const WITHDRAW_NODE_ID = "bank-keyword-withdraw";

/**
 * Adds Canary's free-text money branches ("deposit 500", "withdraw 100") to
 * every NPC that already offers the `bank` action. The importer discards these
 * keyword handlers because their amount is a runtime capture rather than
 * content, so they are composed here instead — the same shape as
 * `withBoatTravelRoutes`.
 *
 * These are parity, not capability: the branches route into the very same
 * `BankService` operations the panel uses, so every limit, range check and
 * ledger coupling is unchanged. The amount comes from the player's own line
 * and is treated as untrusted throughout.
 */
export function withBankKeywords(
  graphs: ReadonlyMap<string, DialogueGraph>,
): ReadonlyMap<string, DialogueGraph> {
  const result = new Map(graphs);
  for (const [typeId, graph] of graphs) {
    if (!graph.nodes.some((node) => node.action?.kind === "bank")) continue;
    const root = findDialogueNode(graph, graph.rootNodeId);
    if (!root) throw new Error(`${typeId} has no dialogue root`);
    for (const reservedId of [DEPOSIT_NODE_ID, WITHDRAW_NODE_ID]) {
      if (graph.nodes.some((node) => node.id === reservedId)) {
        throw new Error(`${typeId} already uses ${reservedId}`);
      }
    }
    const keywordNodes = [
      makeKeywordNode(DEPOSIT_NODE_ID, "deposit", graph.rootNodeId),
      makeKeywordNode(WITHDRAW_NODE_ID, "withdraw", graph.rootNodeId),
    ];
    // Reachable by typing only — deliberately not added to `choices`, because
    // a click has no line to read an amount out of.
    const nextRoot: DialogueNode = {
      ...root,
      children: [...keywordNodes.map((node) => node.id), ...root.children],
    };
    result.set(typeId, {
      ...graph,
      nodes: [
        ...graph.nodes.map((node) => (node.id === root.id ? nextRoot : node)),
        ...keywordNodes,
      ],
    });
  }
  return result;
}

function makeKeywordNode(
  id: string,
  operation: "deposit" | "withdraw",
  rootNodeId: string,
): DialogueNode {
  return {
    id,
    matches: [[operation]],
    // Spoken only when the operation commits; failures answer with their own
    // reason, so this must not promise anything on its own.
    responses: [],
    children: [],
    choices: [],
    nextNodeId: rootNodeId,
    action: { kind: "bank-keyword", operation },
  };
}
