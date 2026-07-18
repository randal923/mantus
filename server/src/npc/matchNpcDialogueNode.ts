import type { DialogueGraph, DialogueNode } from "./DialogueGraph";
import { findDialogueNode } from "./findDialogueNode";
import { matchesNpcDialogueInput } from "./matchesNpcDialogueInput";

export function matchNpcDialogueNode(
  graph: DialogueGraph,
  currentNodeId: string,
  text: string,
): DialogueNode | undefined {
  const current = findDialogueNode(graph, currentNodeId);
  const root = findDialogueNode(graph, graph.rootNodeId);
  const candidateIds = [
    ...(current?.children ?? []),
    ...(currentNodeId === graph.rootNodeId ? [] : (root?.children ?? [])),
  ];
  for (const id of new Set(candidateIds)) {
    const candidate = findDialogueNode(graph, id);
    if (
      candidate &&
      matchesNpcDialogueInput(text, candidate.matches)
    ) {
      return candidate;
    }
  }
  return undefined;
}
