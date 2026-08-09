const QUOTES = new Set(['"', "'"]);

/**
 * If `index` sits on a Lua string opener (quoted or `[[ ]]` long string),
 * returns the index just past its closing delimiter; otherwise null. Every
 * scan below goes through this so commas, braces, and `--` sequences inside
 * book texts never confuse the structural parse.
 */
function stringEnd(lua, index) {
  const character = lua[index];
  if (QUOTES.has(character)) {
    for (let cursor = index + 1; cursor < lua.length; cursor++) {
      if (lua[cursor] === "\\") {
        cursor++;
        continue;
      }
      if (lua[cursor] === character) return cursor + 1;
    }
    throw new Error("unterminated quoted string");
  }
  if (character === "[" && lua[index + 1] === "[") {
    const close = lua.indexOf("]]", index + 2);
    if (close === -1) throw new Error("unterminated long string");
    return close + 2;
  }
  return null;
}

/** Removes `--` line and `--[[ ]]` block comments, preserving string bodies. */
function stripComments(lua) {
  let out = "";
  let index = 0;
  while (index < lua.length) {
    const skipped = stringEnd(lua, index);
    if (skipped !== null) {
      out += lua.slice(index, skipped);
      index = skipped;
      continue;
    }
    if (lua[index] === "-" && lua[index + 1] === "-") {
      if (lua[index + 2] === "[" && lua[index + 3] === "[") {
        const close = lua.indexOf("]]", index + 4);
        if (close === -1) throw new Error("unterminated block comment");
        index = close + 2;
      } else {
        const newline = lua.indexOf("\n", index);
        index = newline === -1 ? lua.length : newline;
      }
      continue;
    }
    out += lua[index];
    index++;
  }
  return out;
}

/** Body of the `local config = { ... }` literal, balanced and string-aware. */
function configBody(lua) {
  const header = /(^|\n)\s*local\s+config\s*=\s*\{/.exec(lua);
  if (!header) throw new Error("local config table literal not found");
  const start = lua.indexOf("{", header.index);
  let depth = 0;
  let index = start;
  while (index < lua.length) {
    const skipped = stringEnd(lua, index);
    if (skipped !== null) {
      index = skipped;
      continue;
    }
    if (lua[index] === "{") depth++;
    else if (lua[index] === "}") {
      depth--;
      if (depth === 0) return lua.slice(start + 1, index);
    }
    index++;
  }
  throw new Error("config table is unbalanced");
}

/** Splits a table body at top-level commas, skipping strings and sub-tables. */
function splitTop(body) {
  const parts = [];
  let depth = 0;
  let start = 0;
  let index = 0;
  while (index < body.length) {
    const skipped = stringEnd(body, index);
    if (skipped !== null) {
      index = skipped;
      continue;
    }
    const character = body[index];
    if (character === "{") depth++;
    else if (character === "}") depth--;
    else if (character === "," && depth === 0) {
      parts.push(body.slice(start, index));
      start = index + 1;
    }
    index++;
  }
  parts.push(body.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}

function parseInteger(value, context) {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`${context}: expected an integer, got ${value}`);
  }
  return Number(value);
}

const ESCAPES = { n: "\n", t: "\t", r: "\r", '"': '"', "'": "'", "\\": "\\" };

/**
 * A Lua string literal to its runtime value. Long strings drop one leading
 * newline (Lua semantics), matching what `setText` receives in the handler.
 */
function parseLuaString(value, context) {
  if (value.startsWith("[[")) {
    if (!value.endsWith("]]")) {
      throw new Error(`${context}: unterminated long string`);
    }
    return value.slice(2, -2).replace(/^\r?\n/, "");
  }
  const quote = value[0];
  if (!QUOTES.has(quote) || !value.endsWith(quote) || value.length < 2) {
    throw new Error(`${context}: expected a string literal, got ${value}`);
  }
  return value
    .slice(1, -1)
    .replace(/\\(.)/g, (whole, escaped) => ESCAPES[escaped] ?? whole);
}

function parseBooleanTrue(value, context) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${context}: expected true/false, got ${value}`);
}

/** Inner body of a `{ ... }` table literal value. */
function tableInner(value, context) {
  if (!value.startsWith("{") || !value.endsWith("}")) {
    throw new Error(`${context}: expected a table literal`);
  }
  return value.slice(1, -1);
}

function parseItem(body, uniqueId, itemIndex, unparsedFields) {
  const context = `entry ${uniqueId} items[${itemIndex}]`;
  let itemId;
  let count = 1;
  let actionId;
  let text;
  let name;
  let decay;
  for (const field of splitTop(body)) {
    const assignment = /^([A-Za-z_]\w*)\s*=\s*([\s\S]*)$/.exec(field);
    if (!assignment) throw new Error(`${context}: unparseable field ${field}`);
    const [, key, value] = assignment;
    switch (key) {
      case "itemId":
        itemId = parseInteger(value, `${context}.itemId`);
        break;
      case "count":
        count = parseInteger(value, `${context}.count`);
        break;
      case "actionId":
        actionId = parseInteger(value, `${context}.actionId`);
        break;
      case "text":
        text = parseLuaString(value, `${context}.text`);
        break;
      case "name":
        name = parseLuaString(value, `${context}.name`);
        break;
      case "decay":
        if (parseBooleanTrue(value, `${context}.decay`)) decay = true;
        break;
      default:
        unparsedFields.push(`items[${itemIndex}].${key}`);
    }
  }
  if (itemId === undefined) throw new Error(`${context}: itemId is missing`);
  return {
    itemId,
    count,
    ...(actionId === undefined ? {} : { actionId }),
    ...(text === undefined ? {} : { text }),
    ...(name === undefined ? {} : { name }),
    ...(decay === undefined ? {} : { decay }),
  };
}

function parseStorageReference(value, storages) {
  if (/^-?\d+$/.test(value)) {
    return { key: Number(value), name: null };
  }
  return { key: storages.get(value) ?? null, name: value };
}

function parseMissionStorage(value, storages, uniqueId) {
  const context = `entry ${uniqueId} missionStorage`;
  let reference;
  let missionValue;
  for (const field of splitTop(tableInner(value, context))) {
    const assignment = /^([A-Za-z_]\w*)\s*=\s*([\s\S]*)$/.exec(field);
    if (!assignment) throw new Error(`${context}: unparseable field ${field}`);
    if (assignment[1] === "key") {
      reference = parseStorageReference(assignment[2], storages);
    } else if (assignment[1] === "value") {
      missionValue = parseInteger(assignment[2], `${context}.value`);
    } else {
      throw new Error(`${context}: unknown field ${assignment[1]}`);
    }
  }
  if (reference === undefined || missionValue === undefined) {
    throw new Error(`${context}: key and value are both required`);
  }
  return { key: reference.key, keyName: reference.name, value: missionValue };
}

function parseNeedItem(value, uniqueId) {
  const context = `entry ${uniqueId} needItem`;
  let itemId;
  let count = 1;
  for (const field of splitTop(tableInner(value, context))) {
    const assignment = /^([A-Za-z_]\w*)\s*=\s*([\s\S]*)$/.exec(field);
    if (!assignment) throw new Error(`${context}: unparseable field ${field}`);
    if (assignment[1] === "itemId") {
      itemId = parseInteger(assignment[2], `${context}.itemId`);
    } else if (assignment[1] === "count") {
      count = parseInteger(assignment[2], `${context}.count`);
    } else {
      throw new Error(`${context}: unknown field ${assignment[1]}`);
    }
  }
  if (itemId === undefined) throw new Error(`${context}: itemId is missing`);
  return { itemId, count };
}

/**
 * Parses the inline `local config = { [uid] = {...} }` table from Canary's
 * data-otservbr-global quest_system2.lua (registered on actionId 2001, keyed
 * by map uniqueId). `storages` is the constants map produced by
 * parseStorageConstants over lib/core/storages.lua. Throws on any entry it
 * cannot fully interpret; unknown-but-well-formed fields are collected into
 * `unparsedFields` instead of being dropped.
 *
 * Handler semantics the JSON consumer needs (from quest_system2.lua onUse):
 * - Gate: reject as "empty" when storage value != (formerValue or -1); with
 *   time=true also while the stored os.time()+86400 timestamp is in the
 *   future (at this pin a used time-chest never passes the formerValue check
 *   again, so it behaves as one-time).
 * - needItem: player must carry it (count default 1); consumed on success.
 * - Rewards: one item is granted bare; several are wrapped in a bag (2853)
 *   or, above 8 items, a backpack (2854). actionId/text/name/decay are
 *   applied per created item; count defaults to 1.
 * - On success: `say` is spoken, `effect` plays at the used position,
 *   missionStorage.key is set to missionStorage.value, and storage is set to
 *   newValue (default 1) — or os.time()+86400 when time=true.
 * - If the player cannot carry the reward nothing is consumed or recorded.
 */
export function parseQuestSystem2(lua, storages) {
  const entries = [];
  for (const chunk of splitTop(configBody(stripComments(lua)))) {
    const match = /^\[\s*(\d+)\s*\]\s*=\s*\{([\s\S]*)\}$/.exec(chunk);
    if (!match) {
      throw new Error(`unparseable config entry: ${chunk.slice(0, 80)}`);
    }
    const uniqueId = Number(match[1]);
    const unparsedFields = [];
    let items = [];
    let storage = null;
    let storageName = null;
    let formerValue;
    let newValue;
    let missionStorage;
    let needItem;
    let say;
    let effectName;
    let time;
    for (const field of splitTop(match[2])) {
      const assignment = /^([A-Za-z_]\w*)\s*=\s*([\s\S]*)$/.exec(field);
      if (!assignment) {
        throw new Error(`entry ${uniqueId}: unparseable field ${field}`);
      }
      const [, key, value] = assignment;
      switch (key) {
        case "items":
          items = splitTop(tableInner(value, `entry ${uniqueId} items`)).map(
            (item, index) =>
              parseItem(
                tableInner(item, `entry ${uniqueId} items[${index}]`),
                uniqueId,
                index,
                unparsedFields,
              ),
          );
          break;
        case "storage": {
          const reference = parseStorageReference(value, storages);
          storage = reference.key;
          storageName = reference.name;
          break;
        }
        case "formerValue":
          formerValue = parseInteger(value, `entry ${uniqueId} formerValue`);
          break;
        case "newValue":
          newValue = parseInteger(value, `entry ${uniqueId} newValue`);
          break;
        case "missionStorage":
          missionStorage = parseMissionStorage(value, storages, uniqueId);
          break;
        case "needItem":
          needItem = parseNeedItem(value, uniqueId);
          break;
        case "say":
          say = parseLuaString(value, `entry ${uniqueId} say`);
          break;
        case "effect":
          if (!/^[A-Z][A-Z0-9_]*$/.test(value)) {
            throw new Error(
              `entry ${uniqueId} effect: expected a CONST_ME constant, got ${value}`,
            );
          }
          effectName = value;
          break;
        case "time":
          if (parseBooleanTrue(value, `entry ${uniqueId} time`)) time = true;
          break;
        default:
          unparsedFields.push(key);
      }
    }
    entries.push({
      uniqueId,
      items,
      storage,
      storageName,
      ...(formerValue === undefined ? {} : { formerValue }),
      ...(newValue === undefined ? {} : { newValue }),
      ...(missionStorage === undefined ? {} : { missionStorage }),
      ...(needItem === undefined ? {} : { needItem }),
      ...(say === undefined ? {} : { say }),
      ...(effectName === undefined ? {} : { effectName }),
      ...(time === undefined ? {} : { time }),
      unparsedFields,
    });
  }
  if (entries.length === 0) throw new Error("no config entries parsed");
  return entries;
}
