const stripComments = (lua) =>
  lua.replace(/--\[\[[\s\S]*?\]\]/g, "").replace(/--[^\n]*/g, "");

/** Body of `name = { ... }` starting at the brace, balanced. */
function tableBody(lua, name) {
  const header = new RegExp(`(^|\\n)${name}\\s*=\\s*\\{`).exec(lua);
  if (!header) throw new Error(`table ${name} not found`);
  const start = lua.indexOf("{", header.index);
  let depth = 0;
  for (let index = start; index < lua.length; index++) {
    if (lua[index] === "{") depth++;
    else if (lua[index] === "}") {
      depth--;
      if (depth === 0) return lua.slice(start + 1, index);
    }
  }
  throw new Error(`table ${name} is unbalanced`);
}

/** Splits a table body into its top-level `key = value` chunks. */
function splitFields(body) {
  const fields = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < body.length; index++) {
    const character = body[index];
    if (character === "{") depth++;
    else if (character === "}") depth--;
    else if (character === "," && depth === 0) {
      fields.push(body.slice(start, index));
      start = index + 1;
    }
  }
  fields.push(body.slice(start));
  return fields.map((field) => field.trim()).filter((field) => field !== "");
}

function splitAssignment(field) {
  const separator = field.indexOf("=");
  if (separator === -1) return null;
  const key = field.slice(0, separator).trim();
  return { key, value: field.slice(separator + 1).trim() };
}

function parsePositions(value) {
  const positions = [];
  for (const match of value.matchAll(
    /x\s*=\s*(\d+)\s*,\s*y\s*=\s*(\d+)\s*,\s*z\s*=\s*(\d+)/g,
  )) {
    positions.push({
      x: Number(match[1]),
      y: Number(match[2]),
      z: Number(match[3]),
    });
  }
  const coordinateCount = value.match(/x\s*=/g)?.length ?? 0;
  if (positions.length !== coordinateCount) {
    throw new Error(`malformed itemPos value: ${value}`);
  }
  return positions;
}

/**
 * Parses the otservbr startup table door_key.lua, where each
 * `[Storage.Quest.Key.IDxxxx]` block lists the map positions of door tiles
 * that get that key action id stamped at startup. `storageConstants` is the
 * dotted-path map produced by parseStorageConstants. Nothing is skipped
 * silently: unresolvable constants, malformed fields, duplicate action ids,
 * and positions claimed by two entries all throw.
 */
export function parseDoorKeyActions(lua, storageConstants) {
  const body = tableBody(stripComments(lua), "KeyDoorAction");
  const doors = [];
  const seenActionIds = new Set();
  const claimedPositions = new Map();
  for (const field of splitFields(body)) {
    const assignment = splitAssignment(field);
    if (!assignment) {
      throw new Error(`unparseable KeyDoorAction field: ${field}`);
    }
    const keyMatch = /^\[\s*([\w.]+)\s*\]$/.exec(assignment.key);
    if (!keyMatch) {
      throw new Error(`unparseable KeyDoorAction key: ${assignment.key}`);
    }
    const actionId = /^\d+$/.test(keyMatch[1])
      ? Number(keyMatch[1])
      : storageConstants.get(keyMatch[1]);
    if (!Number.isInteger(actionId) || actionId <= 0) {
      throw new Error(`unknown storage constant ${keyMatch[1]}`);
    }
    if (seenActionIds.has(actionId)) {
      throw new Error(`key door action id ${actionId} appears twice`);
    }
    seenActionIds.add(actionId);
    if (!assignment.value.startsWith("{") || !assignment.value.endsWith("}")) {
      throw new Error(`unparseable KeyDoorAction entry for ${keyMatch[1]}`);
    }
    let itemId;
    let positions;
    for (const inner of splitFields(assignment.value.slice(1, -1))) {
      const innerAssignment = splitAssignment(inner);
      if (!innerAssignment) {
        throw new Error(`unparseable field in entry ${keyMatch[1]}: ${inner}`);
      }
      if (innerAssignment.key === "itemId") {
        if (innerAssignment.value === "false") itemId = null;
        else if (/^\d+$/.test(innerAssignment.value)) {
          itemId = Number(innerAssignment.value);
        } else {
          throw new Error(
            `invalid itemId in entry ${keyMatch[1]}: ${innerAssignment.value}`,
          );
        }
      } else if (innerAssignment.key === "itemPos") {
        positions = parsePositions(innerAssignment.value);
      } else {
        throw new Error(
          `unexpected field ${innerAssignment.key} in entry ${keyMatch[1]}`,
        );
      }
    }
    if (itemId === undefined || positions === undefined) {
      throw new Error(`entry ${keyMatch[1]} is missing itemId or itemPos`);
    }
    if (positions.length === 0) {
      throw new Error(`entry ${keyMatch[1]} has no positions`);
    }
    for (const position of positions) {
      const key = `${position.x}:${position.y}:${position.z}`;
      const claimedBy = claimedPositions.get(key);
      if (claimedBy !== undefined) {
        throw new Error(
          `position ${key} is claimed by action ids ${claimedBy} and ${actionId}`,
        );
      }
      claimedPositions.set(key, actionId);
    }
    doors.push({ actionId, itemId, positions });
  }
  if (doors.length === 0) {
    throw new Error("no key door entries found in door_key source");
  }
  return doors;
}
