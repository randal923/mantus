const DEFAULT_GREETING = "Greetings, |PLAYERNAME|.";
const DEFAULT_FAREWELL = "Good bye, |PLAYERNAME|.";
const DEFAULT_WALK_AWAY = "Good bye.";
const DEFAULT_TRADE = "Of course, just browse through my wares.";
const ALLOWED_SAY_FIELDS = new Set([
  "cost",
  "message",
  "moveup",
  "npchandler",
  "onlyfocus",
  "onlyunfocus",
  "reset",
  "text",
  "topic",
  "ungreet",
]);

/**
 * Imports greeting and keyword dialogue without executing Canary Lua.
 * `context` carries the pinned lookups the typed command families need:
 * `spellIdsByName` (from the pinned spell catalog) and `rookgaardHints`
 * (from the pinned npc_system module). Both default to empty, in which case
 * the families that need them stay reported rather than guessing.
 */
export function parseCanaryNpcDialogues(definitions, shopTypeIds, options = {}) {
  const context = {
    spellIdsByName: options.spellIdsByName ?? new Map(),
    rookgaardHints: options.rookgaardHints ?? [],
  };
  const dialogues = [];
  const definitionsReport = [];

  for (const definition of definitions) {
    const source = maskComments(definition.source);
    const interactive =
      /FocusModule:new\s*\(/.test(source) ||
      /keywordHandler:add(?:Custom)?GreetKeyword\s*\(/.test(source);
    if (!interactive) {
      definitionsReport.push({
        typeId: definition.typeId,
        sourcePath: definition.path,
        classification: "non-interactive",
        staticNodes: 0,
        unsupportedKeywordActions: [],
        proceduralCallbacks: callbackNames(source),
      });
      continue;
    }

    const messageResult = messageDefinitions(source);
    const messages = messageResult.values;
    const customGreeting = greetingDefinition(source, "Greet");
    const customFarewell = greetingDefinition(source, "Farewell");
    const greetingKeywords = unique([
      "hi",
      "hello",
      ...customGreeting.keywords,
    ]);
    const farewellKeywords = unique([
      "bye",
      "farewell",
      ...customFarewell.keywords,
    ]);
    const greeting =
      customGreeting.responses.length > 0
        ? customGreeting.responses
        : messages.MESSAGE_GREET ?? [DEFAULT_GREETING];
    const farewell =
      customFarewell.responses.length > 0
        ? customFarewell.responses
        : messages.MESSAGE_FAREWELL ?? [DEFAULT_FAREWELL];
    const walkAway = messages.MESSAGE_WALKAWAY ?? [DEFAULT_WALK_AWAY];
    const nodes = [];
    const rootChildren = [];
    const unsupportedKeywordActions = [];

    if (shopTypeIds.has(definition.typeId)) {
      nodes.push({
        id: "trade",
        matches: [["trade"], ["offers"]],
        responses: messages.MESSAGE_SENDTRADE ?? [DEFAULT_TRADE],
        children: [],
        choices: [],
        nextNodeId: "root",
        action: { kind: "shop", shopId: definition.typeId },
      });
      rootChildren.push("trade");
    }
    if (/\bnpc:parse(?:Guild)?Bank(?:Messages)?\s*\(/.test(source)) {
      nodes.push({
        id: "bank",
        matches: [["bank"], ["balance"], ["deposit"], ["withdraw"]],
        responses: ["How may I help with your bank account?"],
        children: [],
        choices: [],
        nextNodeId: "root",
        action: { kind: "bank" },
      });
      rootChildren.push("bank");
    }

    const variableNodes = new Map();
    const travelOffers = [];
    for (const call of keywordCalls(source)) {
      const keywords = keywordArray(call.arguments[0]);
      const action = call.arguments[1]?.trim();
      const parameters = tableFields(call.arguments[2]);
      const parentId =
        call.receiver === "keywordHandler"
          ? "root"
          : variableNodes.get(call.receiver);
      if (keywords.length === 0 || !parentId || !action || !parameters) {
        if (call.assignment) variableNodes.set(call.assignment, undefined);
        if (keywords.length > 0 && action) {
          unsupportedKeywordActions.push({ keywords, action });
        }
        continue;
      }
      // The 4th argument gates the branch, the 5th applies state once it
      // runs. Both become typed content or the whole branch stays reported;
      // an unparsed callback is never silently dropped.
      const gate = translateCondition(call.arguments[3]);
      const effectResult = translateEffects(call.arguments[4]);
      const translated =
        gate.status === "unsupported" || effectResult.status === "unsupported"
          ? {
              status: "unsupported",
              detail: {
                ...(gate.status === "unsupported" ? { callback: true } : {}),
                ...(effectResult.status === "unsupported"
                  ? { effectCallback: true }
                  : {}),
              },
            }
          : translateKeywordAction(action, parameters, context);
      if (translated.status === "unsupported") {
        if (call.assignment) variableNodes.set(call.assignment, undefined);
        unsupportedKeywordActions.push({
          keywords,
          action,
          ...translated.detail,
        });
        continue;
      }
      const id = `dialogue-${nodes.length + 1}`;
      if (translated.offer) {
        travelOffers.push({ ...translated.offer, id: `offer-${id}` });
      }
      nodes.push({
        id,
        matches: keywords.map((keyword) => [keyword]),
        responses: translated.responses,
        children: [],
        choices: [],
        nextNodeId: "root",
        ...(gate.conditions.length > 0 ? { conditions: gate.conditions } : {}),
        ...(effectResult.effects.length > 0
          ? { effects: effectResult.effects }
          : {}),
        ...(translated.ungreet ? { ungreet: true } : {}),
        ...(translated.focus ? { focus: translated.focus } : {}),
        ...(translated.action
          ? {
              action: translated.offer
                ? { ...translated.action, offerId: `offer-${id}` }
                : translated.action,
            }
          : {}),
      });
      if (parentId === "root") rootChildren.push(id);
      else {
        const parent = nodes.find((node) => node.id === parentId);
        if (parent) {
          parent.children.push(id);
          delete parent.nextNodeId;
        }
      }
      if (call.assignment) variableNodes.set(call.assignment, id);
    }

    const root = {
      id: "root",
      matches: [],
      responses: [],
      children: unique(rootChildren),
      choices: [],
    };
    const allNodes = [root, ...nodes];
    for (const node of allNodes) {
      node.choices = node.children.slice(0, 15).map((childId) => {
        const child = allNodes.find((candidate) => candidate.id === childId);
        return {
          nodeId: childId,
          label:
            childId === "trade"
              ? "Trade"
              : childId === "bank"
                ? "Bank"
                : choiceLabel(child?.matches[0]?.[0] ?? childId),
        };
      });
    }
    dialogues.push({
      typeId: definition.typeId,
      talkRange: 4,
      timeoutMs: 30_000,
      greetingKeywords,
      farewellKeywords,
      greeting,
      farewell,
      walkAway,
      rootNodeId: "root",
      nodes: allNodes,
      travelOffers,
    });
    definitionsReport.push({
      typeId: definition.typeId,
      sourcePath: definition.path,
      classification: "interactive",
      staticNodes: nodes.length,
      unsupportedKeywordActions,
      proceduralCallbacks: callbackNames(source),
      unsupportedMessages: messageResult.unsupported,
    });
  }

  return {
    dialogues,
    report: {
      sourceDefinitions: definitions.length,
      interactiveDefinitions: dialogues.length,
      nonInteractiveDefinitions: definitionsReport.filter(
        (definition) => definition.classification === "non-interactive",
      ).length,
      staticNodes: definitionsReport.reduce(
        (total, definition) => total + definition.staticNodes,
        0,
      ),
      unsupportedKeywordActions: definitionsReport.reduce(
        (total, definition) =>
          total + definition.unsupportedKeywordActions.length,
        0,
      ),
      unsupportedMessages: definitionsReport.reduce(
        (total, definition) =>
          total + (definition.unsupportedMessages?.length ?? 0),
        0,
      ),
      proceduralCallbacks: definitionsReport.reduce(
        (total, definition) => total + definition.proceduralCallbacks.length,
        0,
      ),
      definitions: definitionsReport,
    },
  };
}

/**
 * Turns one Canary keyword action into typed content, or reports why it
 * cannot be. Every family here is a reviewed TypeScript command on the
 * server side; there is no general Lua evaluator and never will be.
 */
function translateKeywordAction(action, parameters, context) {
  if (action === "StdModule.say") return translateSay(parameters);
  if (action === "StdModule.learnSpell") {
    return translateLearnSpell(parameters, context);
  }
  if (action === "StdModule.travel") return translateTravel(parameters);
  if (action === "StdModule.kick") return translateKick(parameters);
  if (action === "StdModule.promotePlayer") return translatePromote(parameters);
  if (action === "StdModule.rookgaardHints") {
    return translateHints(parameters, context);
  }
  return { status: "unsupported", detail: {} };
}

function translateSay(parameters) {
  const unsupportedFields = Object.keys(parameters).filter(
    (key) => !ALLOWED_SAY_FIELDS.has(key.toLowerCase()),
  );
  if (unsupportedFields.length > 0) {
    return { status: "unsupported", detail: { unsupportedFields } };
  }
  const responses = renderCostTags(
    responseValue(parameters.text ?? parameters.message),
    parameters,
  );
  if (!responses) return { status: "unsupported", detail: { costTag: true } };
  if (responses.length === 0) {
    return { status: "unsupported", detail: { nonLiteralResponse: true } };
  }
  if (booleanField(parameters.onlyFocus) === false && booleanField(parameters.onlyUnfocus) === true) {
    return { status: "ok", responses, focus: "unfocused" };
  }
  if (booleanField(parameters.onlyUnfocus) === true) {
    return { status: "ok", responses, focus: "unfocused" };
  }
  return {
    status: "ok",
    responses,
    ...(booleanField(parameters.ungreet) === true ? { ungreet: true } : {}),
  };
}

/**
 * |TRAVELCOST| renders the server-owned price. A say node carries no price
 * of its own, so a cost tag is only importable when the cost is a literal.
 */
function renderCostTags(responses, parameters) {
  if (!responses.some((response) => response.includes("|TRAVELCOST|"))) {
    return responses;
  }
  if (parameters.discount !== undefined) return undefined;
  const cost = numberField(parameters.cost);
  if (cost === undefined) return undefined;
  const rendered = cost > 0 ? `${cost} gold` : "free";
  return responses.map((response) =>
    response.replaceAll("|TRAVELCOST|", rendered),
  );
}

function translateLearnSpell(parameters, context) {
  const spellName = luaString(parameters.spellName);
  const price = numberField(parameters.price);
  const level = numberField(parameters.level);
  if (spellName === undefined || price === undefined) {
    return { status: "unsupported", detail: { nonLiteralSpellOffer: true } };
  }
  const spellId = context.spellIdsByName.get(spellName.trim().toLowerCase());
  if (!spellId) {
    // Source-invalid, not silently omitted: the pinned NPC sells a spell the
    // pinned spell catalog does not define.
    return {
      status: "unsupported",
      detail: { sourceInvalid: `spell "${spellName}" is not in the pinned catalog` },
    };
  }
  return {
    status: "ok",
    responses: [`You have learned '${spellName}'.`],
    action: {
      kind: "learn-spell",
      spellId,
      price,
      minimumLevel: level === undefined || level < 1 ? 1 : level,
      premium: booleanField(parameters.premium) === true,
    },
  };
}

function translateTravel(parameters) {
  const destination = positionValue(parameters.destination);
  if (!destination) {
    return { status: "unsupported", detail: { nonLiteralDestination: true } };
  }
  if (parameters.discount !== undefined) {
    return { status: "unsupported", detail: { unsupportedFields: ["discount"] } };
  }
  const cost = numberField(parameters.cost) ?? 0;
  const level = numberField(parameters.level);
  const responses = responseValue(parameters.text);
  return {
    status: "ok",
    responses: responses.length > 0 ? responses : ["Set the sails!"],
    offer: {
      cost,
      destination,
      ...(level !== undefined && level > 1 ? { minimumLevel: level } : {}),
    },
    action: { kind: "travel" },
  };
}

function translateKick(parameters) {
  const destination = positionValue(parameters.destination);
  if (!destination) {
    return { status: "unsupported", detail: { nonLiteralDestination: true } };
  }
  const responses = responseValue(parameters.text);
  return {
    status: "ok",
    responses: responses.length > 0 ? responses : ["Off with you!"],
    offer: { cost: 0, destination },
    action: { kind: "teleport" },
  };
}

function translatePromote(parameters) {
  const cost = numberField(parameters.cost);
  const level = numberField(parameters.level);
  if (cost === undefined || level === undefined) {
    return { status: "unsupported", detail: { nonLiteralPromotion: true } };
  }
  const responses = responseValue(parameters.text);
  return {
    status: "ok",
    responses:
      responses.length > 0 ? responses : ["Congratulations! You are now promoted."],
    action: { kind: "promote", cost, minimumLevel: level },
  };
}

function translateHints(_parameters, context) {
  if (context.rookgaardHints.length === 0) {
    return { status: "unsupported", detail: { missingHintTable: true } };
  }
  return {
    status: "ok",
    responses: context.rookgaardHints[0],
    action: {
      kind: "hint",
      storageKey: "RookgaardHints",
      hints: context.rookgaardHints,
    },
  };
}

/**
 * `function(player) return player:getStorageValue(Storage.A.B) == n end`
 * is the only condition shape imported; anything else keeps its branch out
 * of the content until it is reviewed into a typed condition.
 */
const CONDITION_PATTERN =
  /^function\s*\(\s*player\s*\)\s*return\s+player:getStorageValue\s*\(\s*Storage\.([A-Za-z0-9_.]+)\s*\)\s*(==|~=|>=|<=|>|<)\s*(-?\d+)\s*end$/;
const CONDITION_OPERATORS = {
  "==": "eq",
  "~=": "neq",
  ">=": "gte",
  "<=": "lte",
  ">": "gt",
  "<": "lt",
};
/** `player:setStorageValue(Storage.A.B, n)`, one or more, and nothing else. */
const EFFECT_PATTERN =
  /player:setStorageValue\s*\(\s*Storage\.([A-Za-z0-9_.]+)\s*,\s*(-?\d+)\s*\)/g;

function translateCondition(argument) {
  const source = argument?.trim();
  if (!source || source === "nil") return { status: "ok", conditions: [] };
  const match = CONDITION_PATTERN.exec(source.replace(/\s+/gu, " "));
  if (!match) return { status: "unsupported", conditions: [] };
  return {
    status: "ok",
    conditions: [
      {
        kind: "storage",
        key: match[1],
        operator: CONDITION_OPERATORS[match[2]],
        value: Number(match[3]),
      },
    ],
  };
}

function translateEffects(argument) {
  const source = argument?.trim();
  if (!source || source === "nil") return { status: "ok", effects: [] };
  const normalized = source.replace(/\s+/gu, " ");
  const body = /^function\s*\(\s*player\s*\)(.*)end$/.exec(normalized)?.[1];
  if (body === undefined) return { status: "unsupported", effects: [] };
  const effects = [];
  let consumed = "";
  for (const match of body.matchAll(EFFECT_PATTERN)) {
    effects.push({ kind: "set-storage", key: match[1], value: Number(match[2]) });
    consumed += match[0];
  }
  // Only bodies made up entirely of storage writes are importable; a body
  // that also gives items or teleports stays a reported gap.
  if (effects.length === 0 || body.replace(/\s/gu, "") !== consumed.replace(/\s/gu, "")) {
    return { status: "unsupported", effects: [] };
  }
  return { status: "ok", effects };
}

function positionValue(value) {
  const match = /^Position\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(
    value?.trim() ?? "",
  );
  if (!match) return undefined;
  const position = {
    x: Number(match[1]),
    y: Number(match[2]),
    z: Number(match[3]),
  };
  if (position.x > 65_535 || position.y > 65_535 || position.z > 15) {
    return undefined;
  }
  return position;
}

function numberField(value) {
  const trimmed = value?.trim();
  if (trimmed === undefined || !/^-?\d+$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

function booleanField(value) {
  const trimmed = value?.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return undefined;
}

function messageDefinitions(source) {
  const messages = {};
  const unsupported = [];
  const pattern = /^npcHandler:setMessage\s*\(/gm;
  for (const match of source.matchAll(pattern)) {
    const opening = (match.index ?? 0) + match[0].lastIndexOf("(");
    const body = balancedBody(source, opening, "(", ")");
    if (!body) continue;
    const argumentsList = splitTopLevel(body.value);
    const key = argumentsList[0]?.trim();
    const responses = responseValue(argumentsList[1]);
    if (key && responses.length > 0) messages[key] = responses;
    else if (key && luaString(argumentsList[1]) !== "") {
      unsupported.push({
        key,
        line: source.slice(0, match.index ?? 0).split("\n").length,
      });
    } else if (key) messages[key] = [];
  }
  return { values: messages, unsupported };
}

function greetingDefinition(source, kind) {
  const keywords = [];
  const responses = [];
  const pattern = new RegExp(
    `^keywordHandler:add(?:Custom)?${kind}Keyword\\s*\\(`,
    "gm",
  );
  for (const match of source.matchAll(pattern)) {
    const opening = (match.index ?? 0) + match[0].lastIndexOf("(");
    const body = balancedBody(source, opening, "(", ")");
    if (!body) continue;
    const argumentsList = splitTopLevel(body.value);
    keywords.push(...keywordArray(argumentsList[0]));
    for (const argument of argumentsList.slice(1)) {
      const fields = tableFields(argument);
      if (!fields) continue;
      responses.push(...responseValue(fields.text));
    }
  }
  return { keywords: unique(keywords), responses: unique(responses) };
}

function keywordCalls(source) {
  const calls = [];
  const pattern =
    /^(?:local\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*)?([A-Za-z_][A-Za-z0-9_]*):(addKeyword|addChildKeyword)\s*\(/gm;
  for (const match of source.matchAll(pattern)) {
    const opening = (match.index ?? 0) + match[0].lastIndexOf("(");
    const body = balancedBody(source, opening, "(", ")");
    if (!body) continue;
    calls.push({
      assignment: match[1],
      receiver: match[2],
      method: match[3],
      arguments: splitTopLevel(body.value),
    });
  }
  return calls;
}

function balancedBody(source, opening, open, close) {
  let depth = 0;
  let quote;
  for (let index = opening; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      if (character === "\\") {
        index++;
        continue;
      }
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === open) depth++;
    if (character !== close) continue;
    depth--;
    if (depth === 0) {
      return { value: source.slice(opening + 1, index), end: index + 1 };
    }
  }
  return undefined;
}

function splitTopLevel(value) {
  const parts = [];
  let start = 0;
  let quote;
  const stack = [];
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (quote) {
      if (character === "\\") index++;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if ("{([".includes(character)) stack.push(character);
    else if ("})]".includes(character)) stack.pop();
    else if (character === "," && stack.length === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

function tableFields(value) {
  const trimmed = value?.trim();
  if (!trimmed?.startsWith("{") || !trimmed.endsWith("}")) return undefined;
  const fields = {};
  for (const part of splitTopLevel(trimmed.slice(1, -1))) {
    const assignment = topLevelAssignment(part);
    if (!assignment) continue;
    fields[assignment.key] = assignment.value;
  }
  return fields;
}

function topLevelAssignment(value) {
  let quote;
  const stack = [];
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (quote) {
      if (character === "\\") index++;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if ("{([".includes(character)) stack.push(character);
    else if ("})]".includes(character)) stack.pop();
    else if (character === "=" && stack.length === 0) {
      const key = value.slice(0, index).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return undefined;
      return { key, value: value.slice(index + 1).trim() };
    }
  }
  return undefined;
}

function responseValue(value) {
  const string = luaString(value);
  if (string !== undefined) return string.length === 0 ? [] : [string];
  return stringArray(value).filter((response) => response.length > 0);
}

function keywordArray(value) {
  return stringArray(value).map((keyword) =>
    keyword.length === 0 ? "no" : keyword.toLowerCase(),
  );
}

function stringArray(value) {
  const trimmed = value?.trim();
  if (!trimmed?.startsWith("{") || !trimmed.endsWith("}")) return [];
  const strings = [];
  for (const part of splitTopLevel(trimmed.slice(1, -1))) {
    const string = luaString(part);
    if (string !== undefined) strings.push(string);
  }
  return strings;
}

function luaString(value) {
  const trimmed = value?.trim();
  if (!trimmed || !['"', "'"].includes(trimmed[0])) return undefined;
  const quote = trimmed[0];
  let decoded = "";
  let index = 1;
  while (index < trimmed.length) {
    const character = trimmed[index++];
    if (character === quote) {
      return trimmed.slice(index).trim().length === 0 ? decoded : undefined;
    }
    if (character !== "\\") {
      decoded += character === "\n" || character === "\r" || character === "\t"
        ? " "
        : character;
      continue;
    }
    const escaped = trimmed[index++];
    if (escaped === "z") {
      while (index < trimmed.length && /\s/u.test(trimmed[index])) index++;
      continue;
    }
    const replacements = { n: " ", r: " ", t: " ", "\n": " ", "\r": " " };
    decoded += replacements[escaped] ?? escaped;
  }
  return undefined;
}

function callbackNames(source) {
  return unique(
    [...source.matchAll(/^local\s+function\s+([A-Za-z_][A-Za-z0-9_]*)/gm)]
      .map((match) => match[1])
      .filter((name) => /callback$/i.test(name)),
  );
}

function maskComments(source) {
  let masked = "";
  let index = 0;
  while (index < source.length) {
    const quote = source[index];
    if (quote === '"' || quote === "'") {
      let end = index + 1;
      while (end < source.length) {
        if (source[end] === "\\") {
          end += 2;
          continue;
        }
        end++;
        if (source[end - 1] === quote) break;
      }
      masked += source.slice(index, end);
      index = end;
      continue;
    }
    if (source.startsWith("--[[", index)) {
      const end = source.indexOf("]]", index + 4);
      const stop = end === -1 ? source.length : end + 2;
      masked += source.slice(index, stop).replace(/[^\n]/g, " ");
      index = stop;
      continue;
    }
    if (source.startsWith("--", index)) {
      const end = source.indexOf("\n", index + 2);
      const stop = end === -1 ? source.length : end;
      masked += " ".repeat(stop - index);
      index = stop;
      continue;
    }
    masked += source[index];
    index++;
  }
  return masked;
}

function choiceLabel(keyword) {
  const label = keyword
    .split(/\s+/)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
  return label.slice(0, 40) || "Continue";
}

function unique(values) {
  return [...new Set(values)];
}
