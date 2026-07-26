// Structural parser for Canary's Lua quest-log catalog and storages table.
// Lua is read as text and never executed; anything outside the declarative
// shapes below throws, so a new upstream construct fails the import instead
// of silently dropping data.

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function stripLuaComments(source) {
  // Block comments first (plain `--[[ ... ]]` only, which is all the pinned
  // files use), then line comments; an unknown construct still fails loudly.
  return source
    .replace(/--\[\[[\s\S]*?\]\]/g, "")
    .split("\n")
    .map((line) => {
      let inString = false;
      for (let index = 0; index < line.length; index++) {
        const char = line[index];
        if (char === '"' && line[index - 1] !== "\\") inString = !inString;
        if (!inString && char === "-" && line[index + 1] === "-") {
          return line.slice(0, index);
        }
      }
      return line;
    })
    .join("\n");
}

/**
 * Parses a nested Lua table of `Name = number` leaves (storages.lua) into a
 * dotted-name -> numeric-id map. The root table name itself ("Storage",
 * "GlobalStorage") is kept as the map's namespace prefix and stripped by the
 * caller when it wants the content-key convention.
 */
export function parseLuaStorageTable(source, rootName) {
  const text = stripLuaComments(source);
  const rootMatch = text.match(
    new RegExp(`(?:^|\\n)\\s*${rootName}\\s*=\\s*\\{`),
  );
  if (!rootMatch) throw new Error(`no ${rootName} table found`);
  const entries = new Map();
  const scope = [rootName];
  const positional = [0];
  let index = rootMatch.index + rootMatch[0].length;
  while (index < text.length && scope.length > 0) {
    const rest = text.slice(index);
    const open = rest.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/);
    if (open) {
      scope.push(open[1]);
      positional.push(0);
      index += open[0].length;
      continue;
    }
    const leaf = rest.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(-?\d+)\s*,?/);
    if (leaf) {
      const dotted = [...scope, leaf[1]].join(".");
      if (entries.has(dotted)) {
        throw new Error(`duplicate storage name ${dotted}`);
      }
      entries.set(dotted, Number(leaf[2]));
      index += leaf[0].length;
      continue;
    }
    // Positional array entries in a mixed table become 1-based dotted
    // indexes, Lua's own addressing for them.
    const positionalLeaf = rest.match(/^\s*(-?\d+)\s*,/);
    if (positionalLeaf) {
      positional[positional.length - 1] += 1;
      const dotted = [...scope, String(positional[positional.length - 1])].join(
        ".",
      );
      if (entries.has(dotted)) {
        throw new Error(`duplicate storage name ${dotted}`);
      }
      entries.set(dotted, Number(positionalLeaf[1]));
      index += positionalLeaf[0].length;
      continue;
    }
    const close = rest.match(/^\s*\}\s*,?/);
    if (close) {
      scope.pop();
      positional.pop();
      index += close[0].length;
      continue;
    }
    const blank = rest.match(/^\s+/);
    if (blank) {
      index += blank[0].length;
      continue;
    }
    throw new Error(
      `unparseable ${rootName} content near: ${rest.slice(0, 60)}`,
    );
  }
  return entries;
}

function parseLuaString(rest) {
  const match =
    rest.match(/^"((?:[^"\\]|\\[\s\S])*)"/) ??
    rest.match(/^'((?:[^'\\]|\\[\s\S])*)'/);
  if (!match) return null;
  return {
    value: match[1]
      // Lua `\z` swallows the following whitespace (line continuation).
      .replace(/\\z\s*/g, "")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\n/g, "\n")
      .replace(/\\\\/g, "\\"),
    length: match[0].length,
  };
}

/** One `{ ... }` table body as a raw substring, brace-balanced. */
function tableBody(text, openIndex) {
  let depth = 0;
  let inString = false;
  for (let index = openIndex; index < text.length; index++) {
    const char = text[index];
    if (char === '"' && text[index - 1] !== "\\") inString = !inString;
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return { body: text.slice(openIndex + 1, index), end: index };
    }
  }
  throw new Error("unbalanced table braces");
}

/** Skips one `function ... end` block, keyword-balanced and string-aware. */
function skipLuaFunction(text, startIndex) {
  let depth = 0;
  let index = startIndex;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      const string = parseLuaString(text.slice(index));
      if (!string) throw new Error("unterminated string in function body");
      index += string.length;
      continue;
    }
    const rest = text.slice(index);
    const keyword = rest.match(/^(function|if|do|end)\b/);
    if (keyword) {
      if (keyword[1] === "end") {
        depth -= 1;
        index += 3;
        if (depth === 0) return index;
        continue;
      }
      // `for`/`while` close through their own `do`, so only these count.
      if (keyword[1] !== "if" || /^if[\s(]/.test(rest)) depth += 1;
      index += keyword[1].length;
      continue;
    }
    index += 1;
  }
  throw new Error("unbalanced function block");
}

function parseStates(body) {
  const states = [];
  let dynamicStates = 0;
  const pattern = /\[(-?\d+)\]\s*=\s*/g;
  let match;
  while ((match = pattern.exec(body)) !== null) {
    const rest = body.slice(pattern.lastIndex);
    if (rest.startsWith("function")) {
      // Dynamic per-player state text; classified, never transcribed.
      pattern.lastIndex = skipLuaFunction(body, pattern.lastIndex);
      dynamicStates += 1;
      continue;
    }
    const string = parseLuaString(rest);
    if (!string) throw new Error("mission state without a string value");
    states.push({ value: Number(match[1]), description: string.value });
    pattern.lastIndex += string.length;
  }
  return { states, dynamicStates };
}

function field(body, name) {
  const match = body.match(new RegExp(`(?:^|[,{\\s])${name}\\s*=\\s*`));
  if (!match) return null;
  return match.index + match[0].length;
}

function numberField(body, name) {
  const start = field(body, name);
  if (start === null) return null;
  const match = body.slice(start).match(/^-?\d+/);
  if (!match) throw new Error(`${name} is not a number`);
  return Number(match[0]);
}

function booleanField(body, name) {
  const start = field(body, name);
  if (start === null) return null;
  return body.slice(start).startsWith("true");
}

function stringField(body, name) {
  const start = field(body, name);
  if (start === null) return null;
  const string = parseLuaString(body.slice(start));
  if (!string) throw new Error(`${name} is not a plain string`);
  return string.value;
}

function storageField(body, name) {
  const start = field(body, name);
  if (start === null) return null;
  const rest = body.slice(start);
  const named = rest.match(/^Storage((?:\.[A-Za-z_][A-Za-z0-9_]*)+)/);
  // Content convention: dotted keys without the `Storage.` root.
  if (named) return named[1].slice(1);
  // A few quests pin a raw numeric storage id; the importer resolves it to
  // the named key when storages.lua declares one, else keeps the digits.
  const numeric = rest.match(/^\d+/);
  if (numeric) return numeric[0];
  throw new Error(`${name} is not a Storage.* reference`);
}

/**
 * Parses one quest catalog module (e.g. 001_the_queen_of_the_banshees.lua)
 * into the pinned quest-definition shape. Storage references become dotted
 * content keys; every mission field outside the known set throws upstream
 * in the importer's count assertions.
 */
export function parseCanaryQuestModule(source, questId) {
  const text = stripLuaComments(source);
  const questOpen = text.match(/local\s+quest\s*=\s*\{/);
  if (!questOpen) throw new Error("module has no `local quest = {`");
  const { body } = tableBody(text, questOpen.index + questOpen[0].length - 1);
  const name = stringField(body, "name");
  const startStorageKey = storageField(body, "startStorageId");
  const startStorageValue = numberField(body, "startStorageValue");
  if (!name || !startStorageKey || startStorageValue === null) {
    throw new Error("quest module is missing name/start storage");
  }
  const endStorageKey = storageField(body, "endStorageId");
  const endStorageValue = numberField(body, "endStorageValue");
  const missionsStart = field(body, "missions");
  if (missionsStart === null) throw new Error(`quest ${name} has no missions`);
  const missionsTable = tableBody(body, body.indexOf("{", missionsStart));
  const missions = [];
  const missionPattern = /\[(\d+)\]\s*=\s*\{/g;
  let missionMatch;
  while ((missionMatch = missionPattern.exec(missionsTable.body)) !== null) {
    const mission = tableBody(
      missionsTable.body,
      missionMatch.index + missionMatch[0].length - 1,
    );
    const missionBody = mission.body;
    const { states, dynamicStates } = (() => {
      const start = field(missionBody, "states");
      if (start === null) return { states: [], dynamicStates: 0 };
      const table = tableBody(missionBody, missionBody.indexOf("{", start));
      return parseStates(table.body);
    })();
    // Dynamic descriptions (Lua callbacks over live player state) cannot be
    // transcribed; they ship classified, and the runtime shows Canary's own
    // missing-state fallback until each gets its pinned formula.
    const descriptionStart = field(missionBody, "description");
    const dynamicDescription =
      descriptionStart !== null &&
      missionBody.slice(descriptionStart).startsWith("function");
    const description = dynamicDescription
      ? null
      : stringField(missionBody, "description");
    const entry = {
      missionId: numberField(missionBody, "missionId"),
      name: stringField(missionBody, "name"),
      storageKey: storageField(missionBody, "storageId"),
      startValue: numberField(missionBody, "startValue"),
      endValue: numberField(missionBody, "endValue"),
    };
    if (
      entry.missionId === null ||
      !entry.name ||
      !entry.storageKey ||
      entry.startValue === null ||
      entry.endValue === null
    ) {
      throw new Error(`quest ${name} mission is missing required fields`);
    }
    if (booleanField(missionBody, "ignoreendvalue")) {
      entry.ignoreEndValue = true;
    }
    if (booleanField(missionBody, "hideWhenNextStarted")) {
      entry.hideWhenNextStarted = true;
    }
    if (description !== null) entry.description = description;
    if (states.length > 0) entry.states = states;
    if (dynamicDescription) entry.dynamicDescription = true;
    if (dynamicStates > 0) entry.dynamicStates = dynamicStates;
    if (
      description === null &&
      states.length === 0 &&
      !dynamicDescription &&
      dynamicStates === 0
    ) {
      throw new Error(
        `quest ${name} mission ${entry.missionId} has no description`,
      );
    }
    missions.push(entry);
    missionPattern.lastIndex = missionMatch.index + missionMatch[0].length +
      (mission.end - (missionMatch.index + missionMatch[0].length - 1));
  }
  if (missions.length === 0) throw new Error(`quest ${name} has no missions`);
  const quest = { questId, name, startStorageKey, startStorageValue };
  if (endStorageKey !== null && endStorageValue !== null) {
    quest.endStorageKey = endStorageKey;
    quest.endStorageValue = endStorageValue;
  }
  quest.missions = missions;
  return quest;
}

/** The ordered module list from catalog/init.lua. */
export function parseCatalogInit(source) {
  const text = stripLuaComments(source);
  const modules = [];
  const pattern = /"([a-z0-9_]+)"/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (IDENTIFIER.test(match[1]) || /^\d/.test(match[1])) {
      modules.push(match[1]);
    }
  }
  if (modules.length === 0) throw new Error("catalog init lists no modules");
  return modules;
}
