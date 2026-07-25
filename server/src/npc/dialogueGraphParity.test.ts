import { describe, expect, it } from "vitest";
import { loadCreatureContent } from "../spawn/loadCreatureContent";
import type { DialogueAction, DialogueGraph } from "./DialogueGraph";
import { matchNpcDialogueNode } from "./matchNpcDialogueNode";

/**
 * Feature 40 — dialogue-graph engine parity fixture.
 *
 * Every branch in the imported content must resolve to an executable typed
 * path: a known action kind, references that exist, conditions the executor
 * can evaluate, and effects it can apply. Anything the importer could not
 * type is an explicit entry in the import report (Feature 39's gate), never
 * a graph node the engine would silently ignore.
 */
const EXECUTABLE_ACTIONS: ReadonlyArray<DialogueAction["kind"]> = [
  "travel",
  "teleport",
  "promote",
  "shop",
  "bank",
  "bank-keyword",
  "learn-spell",
  "hint",
];
const CONDITION_KINDS = ["storage", "level", "premium"];

const content = loadCreatureContent("world", "otservbr");
const graphs: ReadonlyArray<readonly [string, DialogueGraph]> = [
  ...content.npcTypes.values(),
]
  .filter((type) => type.dialogue !== undefined)
  .map((type) => [type.id, type.dialogue as DialogueGraph] as const);

describe("dialogue graph parity", () => {
  it("covers every interactive NPC in the pinned world", () => {
    expect(graphs.length).toBe(949);
  });

  it("resolves every node to an executable typed path", () => {
    const problems: string[] = [];
    for (const [typeId, graph] of graphs) {
      const nodeIds = new Set(graph.nodes.map((node) => node.id));
      const offerIds = new Set(graph.travelOffers.map((offer) => offer.id));
      for (const node of graph.nodes) {
        for (const reference of [
          ...node.children,
          ...node.choices.map((choice) => choice.nodeId),
          ...(node.nextNodeId ? [node.nextNodeId] : []),
        ]) {
          if (!nodeIds.has(reference)) {
            problems.push(`${typeId}/${node.id} -> missing node ${reference}`);
          }
        }
        const action = node.action;
        if (!action) continue;
        if (!EXECUTABLE_ACTIONS.includes(action.kind)) {
          problems.push(`${typeId}/${node.id} -> unknown action ${action.kind}`);
        }
        if (
          (action.kind === "travel" || action.kind === "teleport") &&
          !offerIds.has(action.offerId)
        ) {
          problems.push(`${typeId}/${node.id} -> missing offer`);
        }
        if (action.kind === "shop" && !content.shopCatalogs.has(action.shopId)) {
          problems.push(`${typeId}/${node.id} -> missing shop`);
        }
        if (action.kind === "hint" && action.hints.length === 0) {
          problems.push(`${typeId}/${node.id} -> empty hint table`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("keeps every condition and effect evaluable by the executor", () => {
    const problems: string[] = [];
    for (const [typeId, graph] of graphs) {
      for (const node of graph.nodes) {
        for (const condition of node.conditions ?? []) {
          if (!CONDITION_KINDS.includes(condition.kind)) {
            problems.push(`${typeId}/${node.id} -> ${condition.kind}`);
          }
        }
        for (const effect of node.effects ?? []) {
          if (effect.kind !== "set-storage") {
            problems.push(`${typeId}/${node.id} -> ${effect.kind}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("reaches every non-root node from the graph's entry points", () => {
    const unreachable: string[] = [];
    for (const [typeId, graph] of graphs) {
      const byId = new Map(graph.nodes.map((node) => [node.id, node]));
      const reachable = new Set<string>([graph.rootNodeId]);
      const queue = [graph.rootNodeId];
      while (queue.length > 0) {
        const current = byId.get(queue.shift() as string);
        for (const next of [
          ...(current?.children ?? []),
          ...(current?.choices.map((choice) => choice.nodeId) ?? []),
          ...(current?.nextNodeId ? [current.nextNodeId] : []),
        ]) {
          if (reachable.has(next)) continue;
          reachable.add(next);
          queue.push(next);
        }
      }
      for (const node of graph.nodes) {
        if (!reachable.has(node.id)) unreachable.push(`${typeId}/${node.id}`);
      }
    }
    expect(unreachable).toEqual([]);
  });

  it("never offers an unfocused branch inside a conversation", () => {
    for (const [typeId, graph] of graphs) {
      for (const node of graph.nodes) {
        if (node.focus !== "unfocused") continue;
        const keyword = node.matches[0]?.[0];
        if (!keyword) continue;
        expect(
          matchNpcDialogueNode(graph, graph.rootNodeId, keyword)?.id,
          `${typeId}/${node.id}`,
        ).not.toBe(node.id);
        expect(
          matchNpcDialogueNode(graph, graph.rootNodeId, keyword, "unfocused")?.id,
          `${typeId}/${node.id}`,
        ).toBe(node.id);
      }
    }
  });

  it("prices every money-touching branch server-side", () => {
    for (const [typeId, graph] of graphs) {
      for (const node of graph.nodes) {
        if (node.action?.kind === "learn-spell") {
          expect(node.action.price, typeId).toBeGreaterThanOrEqual(0);
          expect(node.action.minimumLevel, typeId).toBeGreaterThanOrEqual(1);
        }
        if (node.action?.kind === "promote") {
          expect(node.action.cost, typeId).toBeGreaterThanOrEqual(0);
        }
      }
      for (const offer of graph.travelOffers) {
        expect(offer.cost, typeId).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
