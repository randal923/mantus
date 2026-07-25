import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Position } from "@tibia/protocol";
import { loadCanarySpellCatalog } from "../combat/loadCanarySpellCatalog";
import type {
  DialogueAction,
  DialogueChoiceDefinition,
  DialogueCondition,
  DialogueEffect,
  DialogueGraph,
  DialogueNode,
  NpcTravelOffer,
} from "./DialogueGraph";
import { withBoatTravelRoutes } from "./withBoatTravelRoutes";

const BASELINE_CONTENT_FILE = fileURLToPath(
  new URL(
    "../../../content/npcs/canary-dialogue-baseline.json",
    import.meta.url,
  ),
);
const REVIEWED_CONTENT_FILE = fileURLToPath(
  new URL("../../../content/npcs/canary-dialogues.json", import.meta.url),
);
const IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STORAGE_KEY = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/;

export function loadNpcDialogueGraphs(
  expectedCanaryCommit: string,
  /** Overridable so fail-closed tests can feed the loader injected defects. */
  contentFiles: ReadonlyArray<string> = [
    BASELINE_CONTENT_FILE,
    REVIEWED_CONTENT_FILE,
  ],
): ReadonlyMap<string, DialogueGraph> {
  const graphs = new Map<string, DialogueGraph>();
  for (const contentFile of contentFiles) {
    const document = record(
      JSON.parse(readFileSync(contentFile, "utf8")),
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
    const documentTypeIds = new Set<string>();
    for (const value of document.dialogues) {
      const definition = record(value, "NPC dialogue definition");
      const typeId = identifier(definition.typeId, "NPC dialogue type id");
      if (documentTypeIds.has(typeId)) {
        throw new Error(`duplicate NPC dialogue definition ${typeId}`);
      }
      documentTypeIds.add(typeId);
      graphs.set(typeId, parseGraph(definition));
    }
  }
  // Promotion actions used to be composed in here from a hard-coded ruler
  // list; the importer now derives them from `StdModule.promotePlayer` in the
  // pinned sources, so the composition step is gone.
  return withBoatTravelRoutes(graphs, expectedCanaryCommit);
}

/**
 * Spell ids a `learn-spell` offer may name. Resolved from the pinned spell
 * catalog so a reviewed dialogue can never sell a spell the server cannot
 * cast; a drifted id fails the load instead of failing at purchase time.
 */
let cachedSpellIds: ReadonlySet<string> | undefined;

function knownSpellIdSet(): ReadonlySet<string> {
  cachedSpellIds ??= new Set(
    loadCanarySpellCatalog().map((spell) => spell.id),
  );
  return cachedSpellIds;
}

function parseGraph(value: Record<string, unknown>): DialogueGraph {
  const knownSpellIds = knownSpellIdSet();
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
    if (
      (node.action?.kind === "travel" || node.action?.kind === "teleport") &&
      !offerIds.has(node.action.offerId)
    ) {
      throw new Error(
        `${node.id} references missing travel offer ${node.action.offerId}`,
      );
    }
    if (node.action?.kind === "learn-spell" && !knownSpellIds.has(node.action.spellId)) {
      throw new Error(
        `${node.id} references unknown spell ${node.action.spellId}`,
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
    walkAway: array(value.walkAway, "NPC walk-away", 0, 8)
      .filter((entry) => entry !== "")
      .map((entry) => text(entry, "NPC walk-away", 1_000)),
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
  const conditions = array(
    node.conditions ?? [],
    "NPC dialogue conditions",
    0,
    8,
  ).map(parseCondition);
  const effects = array(node.effects ?? [], "NPC dialogue effects", 0, 8).map(
    parseEffect,
  );
  if (node.focus !== undefined && node.focus !== "focused" && node.focus !== "unfocused") {
    throw new Error("NPC dialogue focus is invalid");
  }
  if (node.ungreet !== undefined && typeof node.ungreet !== "boolean") {
    throw new Error("NPC dialogue ungreet is invalid");
  }
  return {
    id: identifier(node.id, "NPC dialogue node id"),
    matches,
    responses: strings(node.responses, "NPC dialogue responses", 0, 16, 1_000),
    children: identifiers(node.children, "NPC dialogue children", 0, 512),
    choices,
    ...(node.nextNodeId === undefined
      ? {}
      : { nextNodeId: identifier(node.nextNodeId, "next dialogue node") }),
    ...(node.offerId === undefined
      ? {}
      : { offerId: identifier(node.offerId, "dialogue travel offer") }),
    ...(conditions.length > 0 ? { conditions } : {}),
    ...(effects.length > 0 ? { effects } : {}),
    ...(node.ungreet === true ? { ungreet: true } : {}),
    ...(node.focus === "unfocused" ? { focus: "unfocused" as const } : {}),
    ...(action ? { action } : {}),
  };
}

const CONDITION_OPERATORS = ["eq", "neq", "gte", "lte", "gt", "lt"] as const;

function parseCondition(value: unknown): DialogueCondition {
  const condition = record(value, "NPC dialogue condition");
  if (condition.kind === "storage") {
    const operator = CONDITION_OPERATORS.find(
      (candidate) => candidate === condition.operator,
    );
    if (!operator) throw new Error("NPC dialogue condition operator is invalid");
    return {
      kind: "storage",
      key: storageKey(condition.key),
      operator,
      value: integer(
        condition.value,
        "NPC dialogue condition value",
        -2_147_483_648,
        2_147_483_647,
      ),
    };
  }
  if (condition.kind === "level") {
    return {
      kind: "level",
      minimum: integer(condition.minimum, "NPC dialogue level", 1, 10_000),
    };
  }
  if (condition.kind === "premium") {
    if (typeof condition.required !== "boolean") {
      throw new Error("NPC dialogue premium condition is invalid");
    }
    return { kind: "premium", required: condition.required };
  }
  throw new Error("NPC dialogue condition is unsupported");
}

function parseEffect(value: unknown): DialogueEffect {
  const effect = record(value, "NPC dialogue effect");
  if (effect.kind !== "set-storage") {
    throw new Error("NPC dialogue effect is unsupported");
  }
  return {
    kind: "set-storage",
    key: storageKey(effect.key),
    value: integer(
      effect.value,
      "NPC dialogue effect value",
      -2_147_483_648,
      2_147_483_647,
    ),
  };
}

/**
 * Quest state keys are dotted paths mirroring Canary's `Storage.*` tables.
 * They are validated here and never leave the server (charter rule 6).
 */
function storageKey(value: unknown): string {
  const key = text(value, "NPC dialogue storage key", 192);
  if (!STORAGE_KEY.test(key)) throw new Error("NPC dialogue storage key is invalid");
  return key;
}

function parseChoice(value: unknown): DialogueChoiceDefinition {
  const choice = record(value, "NPC dialogue choice");
  return {
    nodeId: identifier(choice.nodeId, "NPC dialogue choice node"),
    label: text(choice.label, "NPC dialogue choice label", 40),
  };
}

function parseAction(value: unknown): DialogueAction {
  const action = record(value, "NPC dialogue action");
  if (action.kind === "travel") {
    return {
      kind: "travel",
      offerId: identifier(action.offerId, "NPC travel action offer"),
    };
  }
  if (action.kind === "teleport") {
    return {
      kind: "teleport",
      offerId: identifier(action.offerId, "NPC teleport action offer"),
    };
  }
  if (action.kind === "shop") {
    return {
      kind: "shop",
      shopId: identifier(action.shopId, "NPC shop action id"),
    };
  }
  if (action.kind === "bank") {
    return { kind: "bank" };
  }
  if (action.kind === "promote") {
    return {
      kind: "promote",
      cost: integer(action.cost, "NPC promotion cost", 0, 1_000_000_000),
      minimumLevel: integer(
        action.minimumLevel,
        "NPC promotion level",
        1,
        10_000,
      ),
    };
  }
  if (action.kind === "learn-spell") {
    if (typeof action.premium !== "boolean") {
      throw new Error("NPC spell offer premium flag is invalid");
    }
    return {
      kind: "learn-spell",
      spellId: identifier(action.spellId, "NPC spell offer id"),
      price: integer(action.price, "NPC spell price", 0, 1_000_000_000),
      minimumLevel: integer(action.minimumLevel, "NPC spell level", 1, 10_000),
      premium: action.premium,
    };
  }
  if (action.kind === "hint") {
    return {
      kind: "hint",
      storageKey: storageKey(action.storageKey),
      hints: array(action.hints, "NPC hints", 1, 64).map((entry) =>
        strings(entry, "NPC hint lines", 1, 8, 1_000),
      ),
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
    ...(offer.diversion === undefined
      ? {}
      : { diversion: parseDiversion(offer.diversion) }),
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

function parseDiversion(
  value: unknown,
): NonNullable<NpcTravelOffer["diversion"]> {
  const diversion = record(value, "NPC travel diversion");
  return {
    oneIn: integer(
      diversion.oneIn,
      "NPC travel diversion denominator",
      1,
      1_000_000,
    ),
    destination: position(diversion.destination),
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
