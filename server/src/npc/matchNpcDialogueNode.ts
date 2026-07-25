import type { DialogueGraph, DialogueNode } from "./DialogueGraph";
import { findDialogueNode } from "./findDialogueNode";
import { matchesNpcDialogueInput } from "./matchesNpcDialogueInput";

/**
 * Picks the branch a line of speech reaches. `focus` splits the two Canary
 * worlds: ordinary branches answer inside a conversation, `onlyUnfocus`
 * branches answer only outside one. A branch never answers in both.
 */
export function matchNpcDialogueNode(
  graph: DialogueGraph,
  currentNodeId: string,
  text: string,
  focus: "focused" | "unfocused" = "focused",
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
      (candidate.focus ?? "focused") === focus &&
      matchesNpcDialogueInput(text, candidate.matches)
    ) {
      return candidate;
    }
  }
  return undefined;
}
