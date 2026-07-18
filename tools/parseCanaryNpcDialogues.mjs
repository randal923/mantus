const DEFAULT_GREETING = "Greetings, |PLAYERNAME|.";
const DEFAULT_FAREWELL = "Good bye, |PLAYERNAME|.";
const DEFAULT_WALK_AWAY = "Good bye.";
const DEFAULT_TRADE = "Of course, just browse through my wares.";
const ALLOWED_SAY_FIELDS = new Set([
  "moveup",
  "npchandler",
  "onlyfocus",
  "reset",
  "text",
  "topic",
]);

/** Imports literal greeting and keyword dialogue without executing Canary Lua. */
export function parseCanaryNpcDialogues(definitions, shopTypeIds) {
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
    for (const call of keywordCalls(source)) {
      const keywords = keywordArray(call.arguments[0]);
      const action = call.arguments[1]?.trim();
      const parameters = tableFields(call.arguments[2]);
      const parentId =
        call.receiver === "keywordHandler"
          ? "root"
          : variableNodes.get(call.receiver);
      if (
        keywords.length === 0 ||
        !parentId ||
        action !== "StdModule.say" ||
        !parameters
      ) {
        if (call.assignment) variableNodes.set(call.assignment, undefined);
        if (keywords.length > 0 && action && action !== "StdModule.say") {
          unsupportedKeywordActions.push({ keywords, action });
        }
        continue;
      }
      const unsupportedFields = Object.keys(parameters).filter(
        (key) => !ALLOWED_SAY_FIELDS.has(key.toLowerCase()),
      );
      const hasCallback = call.arguments
        .slice(3)
        .some((argument) => !["", "nil"].includes(argument.trim()));
      const responses = responseValue(parameters.text);
      if (unsupportedFields.length > 0 || hasCallback || responses.length === 0) {
        if (call.assignment) variableNodes.set(call.assignment, undefined);
        unsupportedKeywordActions.push({
          keywords,
          action,
          ...(unsupportedFields.length === 0 ? {} : { unsupportedFields }),
          ...(hasCallback ? { callback: true } : {}),
          ...(responses.length > 0 ? {} : { nonLiteralResponse: true }),
        });
        continue;
      }
      const id = `dialogue-${nodes.length + 1}`;
      nodes.push({
        id,
        matches: keywords.map((keyword) => [keyword]),
        responses,
        children: [],
        choices: [],
        nextNodeId: "root",
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
      travelOffers: [],
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
