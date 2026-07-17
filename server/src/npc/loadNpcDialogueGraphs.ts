import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Position } from "@tibia/protocol";
import type {
  DialogueChoiceDefinition,
  DialogueGraph,
  DialogueNode,
  NpcTravelOffer,
} from "./DialogueGraph";

const CONTENT_FILE = fileURLToPath(
  new URL("../../../content/npcs/canary-dialogues.json", import.meta.url),
);
const IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function loadNpcDialogueGraphs(
  expectedCanaryCommit: string,
): ReadonlyMap<string, DialogueGraph> {
  const document = record(
    JSON.parse(readFileSync(CONTENT_FILE, "utf8")),
    "NPC dialogue document",
  );
  if (document.formatVersion !== 1) {
    throw new Error("NPC dialogue content has an unsupported version");
  }
  const source = record(document.source, "NPC dialogue source");
  if (source.canaryCommit !== expectedCanaryCommit) {
    throw new Error("NPC dialogue content does not match creature content");
  }
  if (!Array.isArray(document.dialogues)) {
    throw new Error("NPC dialogue definitions must be an array");
  }
  const graphs = new Map<string, DialogueGraph>();
  for (const value of document.dialogues) {
    const definition = record(value, "NPC dialogue definition");
    const typeId = identifier(definition.typeId, "NPC dialogue type id");
    if (graphs.has(typeId)) {
      throw new Error(`duplicate NPC dialogue definition ${typeId}`);
    }
    graphs.set(typeId, parseGraph(definition));
  }
  return graphs;
}

function parseGraph(value: Record<string, unknown>): DialogueGraph {
  const nodes = array(value.nodes, "NPC dialogue nodes", 1, 512).map(parseNode);
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) throw new Error(`duplicate dialogue node ${node.id}`);
    nodeIds.add(node.id);
  }
  const offers = array(value.travelOffers, "NPC travel offers", 0, 64).map(
    parseOffer,
  );
  const offerIds = new Set<string>();
  for (const offer of offers) {
    if (offerIds.has(offer.id)) throw new Error(`duplicate travel offer ${offer.id}`);
    offerIds.add(offer.id);
  }
  const rootNodeId = identifier(value.rootNodeId, "NPC dialogue root node");
  if (!nodeIds.has(rootNodeId)) throw new Error("NPC dialogue root node is missing");
  for (const node of nodes) {
    if (new Set(node.children).size !== node.children.length) {
      throw new Error(`${node.id} has duplicate dialogue children`);
    }
    const choiceNodeIds = node.choices.map((choice) => choice.nodeId);
    if (new Set(choiceNodeIds).size !== choiceNodeIds.length) {
      throw new Error(`${node.id} has duplicate dialogue choices`);
    }
    for (const reference of [
      ...node.children,
      ...node.choices.map((choice) => choice.nodeId),
      ...(node.nextNodeId ? [node.nextNodeId] : []),
    ]) {
      if (!nodeIds.has(reference)) {
        throw new Error(`${node.id} references missing dialogue node ${reference}`);
      }
    }
    if (node.offerId && !offerIds.has(node.offerId)) {
      throw new Error(`${node.id} references missing travel offer ${node.offerId}`);
    }
    if (node.action?.kind === "travel" && !offerIds.has(node.action.offerId)) {
      throw new Error(
        `${node.id} references missing travel offer ${node.action.offerId}`,
      );
    }
  }
  return {
    talkRange: integer(value.talkRange, "NPC talk range", 1, 8),
    timeoutMs: integer(value.timeoutMs, "NPC dialogue timeout", 1_000, 300_000),
    greetingKeywords: strings(
      value.greetingKeywords,
      "NPC greeting keywords",
      1,
      16,
      40,
    ),
    farewellKeywords: strings(
      value.farewellKeywords,
      "NPC farewell keywords",
      1,
      16,
      40,
    ),
    greeting: strings(value.greeting, "NPC greeting", 1, 8, 1_000),
    farewell: strings(value.farewell, "NPC farewell", 1, 8, 1_000),
    walkAway: strings(value.walkAway, "NPC walk-away", 1, 8, 1_000),
    rootNodeId,
    nodes,
    travelOffers: offers,
  };
}

function parseNode(value: unknown): DialogueNode {
  const node = record(value, "NPC dialogue node");
  const matches = array(node.matches, "NPC dialogue matches", 0, 32).map(
    (entry) => strings(entry, "NPC dialogue match", 1, 8, 40),
  );
  const choices = array(node.choices, "NPC dialogue choices", 0, 15).map(
    parseChoice,
  );
  const action = node.action === undefined
    ? undefined
    : parseAction(node.action);
  return {
    id: identifier(node.id, "NPC dialogue node id"),
    matches,
    responses: strings(node.responses, "NPC dialogue responses", 0, 8, 1_000),
    children: identifiers(node.children, "NPC dialogue children", 0, 512),
    choices,
    ...(node.nextNodeId === undefined
      ? {}
      : { nextNodeId: identifier(node.nextNodeId, "next dialogue node") }),
    ...(node.offerId === undefined
      ? {}
      : { offerId: identifier(node.offerId, "dialogue travel offer") }),
    ...(action ? { action } : {}),
  };
}

function parseChoice(value: unknown): DialogueChoiceDefinition {
  const choice = record(value, "NPC dialogue choice");
  return {
    nodeId: identifier(choice.nodeId, "NPC dialogue choice node"),
    label: text(choice.label, "NPC dialogue choice label", 40),
  };
}

function parseAction(value: unknown): DialogueNode["action"] {
  const action = record(value, "NPC dialogue action");
  if (action.kind === "travel") {
    return {
      kind: "travel",
      offerId: identifier(action.offerId, "NPC travel action offer"),
    };
  }
  if (action.kind === "shop") {
    return {
      kind: "shop",
      shopId: identifier(action.shopId, "NPC shop action id"),
    };
  }
  throw new Error("NPC dialogue action is unsupported");
}

function parseOffer(value: unknown): NpcTravelOffer {
  const offer = record(value, "NPC travel offer");
  return {
    id: identifier(offer.id, "NPC travel offer id"),
    cost: integer(offer.cost, "NPC travel cost", 0, 1_000_000_000),
    destination: position(offer.destination),
    ...(offer.minimumLevel === undefined
      ? {}
      : {
          minimumLevel: integer(
            offer.minimumLevel,
            "NPC travel minimum level",
            1,
            10_000,
          ),
        }),
  };
}

function position(value: unknown): Position {
  const position = record(value, "NPC travel destination");
  return {
    x: integer(position.x, "NPC travel x", 0, 65_535),
    y: integer(position.y, "NPC travel y", 0, 65_535),
    z: integer(position.z, "NPC travel z", 0, 15),
  };
}

function identifiers(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): string[] {
  return array(value, label, minimum, maximum).map((entry) =>
    identifier(entry, label),
  );
}

function strings(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  maxLength: number,
): string[] {
  return array(value, label, minimum, maximum).map((entry) =>
    text(entry, label, maxLength),
  );
}

function array(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${label} must contain ${minimum}-${maximum} entries`);
  }
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function identifier(value: unknown, label: string): string {
  const parsed = text(value, label, 64);
  if (!IDENTIFIER.test(parsed)) throw new Error(`${label} is invalid`);
  return parsed;
}

function text(value: unknown, label: string, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001F\u007F-\u009F]/u.test(value)
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${label} is out of range`);
  }
  return value;
}
