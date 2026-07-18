import type { DialogueGraph, DialogueNode } from "./DialogueGraph";

export function findDialogueNode(
  graph: DialogueGraph,
  nodeId: string,
): DialogueNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}
