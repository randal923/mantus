import type { DialogueAction, DialogueGraph, DialogueNode } from "./DialogueGraph";
import { findDialogueNode } from "./findDialogueNode";

type BlessAction = Extract<DialogueAction, { kind: "bless" }>;

/**
 * The bless offer a node quotes: its own action, or the one on the confirm
 * branch among its children/choices (the ask node says the price, the "yes"
 * child carries the purchase — the same split travel uses via `offerId`).
 */
export function findBlessAction(
  graph: DialogueGraph,
  node: DialogueNode,
): BlessAction | undefined {
  if (node.action?.kind === "bless") return node.action;
  for (const reference of [
    ...node.choices.map((choice) => choice.nodeId),
    ...node.children,
  ]) {
    const target = findDialogueNode(graph, reference);
    if (target?.action?.kind === "bless") return target.action;
  }
  return undefined;
}
