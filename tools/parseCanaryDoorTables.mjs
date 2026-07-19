const stripComments = (lua) =>
  lua.replace(/--\[\[[\s\S]*?\]\]/g, "").replace(/--[^\n]*/g, "");

function parseEntries(lua, tableName) {
  const match = stripComments(lua).match(
    new RegExp(`${tableName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  if (!match) throw new Error(`table ${tableName} not found in doors source`);
  const entries = [];
  for (const body of match[1].matchAll(/\{([^{}]*)\}/g)) {
    const fields = {};
    for (const pair of body[1].matchAll(/(\w+)\s*=\s*(\d+)/g)) {
      fields[pair[1]] = Number(pair[2]);
    }
    if (Object.keys(fields).length > 0) entries.push(fields);
  }
  return entries;
}

/**
 * Parses Canary's data/libs/tables/doors.lua into typed door pairs. Every id
 * is validated to appear in exactly one pair so the runtime lookup is
 * unambiguous; open ids shared by two closed variants keep the first pair
 * (matching Canary's first-match-wins table scan).
 */
export function parseDoorPairs(lua) {
  const tables = [
    ["KeyDoorTable", "key"],
    ["CustomDoorTable", "custom"],
    ["QuestDoorTable", "quest"],
    ["LevelDoorTable", "level"],
  ];
  const doors = [];
  const seenClosed = new Set();
  const seenLocked = new Set();
  for (const [tableName, variant] of tables) {
    for (const entry of parseEntries(lua, tableName)) {
      const { lockedDoor, closedDoor, openDoor } = entry;
      if (
        !Number.isInteger(closedDoor) ||
        closedDoor <= 0 ||
        !Number.isInteger(openDoor) ||
        openDoor <= 0 ||
        (variant === "key" && (!Number.isInteger(lockedDoor) || lockedDoor <= 0))
      ) {
        throw new Error(`invalid ${tableName} entry: ${JSON.stringify(entry)}`);
      }
      if (seenClosed.has(closedDoor) || seenLocked.has(closedDoor)) {
        throw new Error(`door id ${closedDoor} appears in two pairs`);
      }
      seenClosed.add(closedDoor);
      if (variant === "key") {
        if (seenLocked.has(lockedDoor) || seenClosed.has(lockedDoor)) {
          throw new Error(`door id ${lockedDoor} appears in two pairs`);
        }
        seenLocked.add(lockedDoor);
      }
      doors.push({
        variant,
        ...(variant === "key" ? { lockedId: lockedDoor } : {}),
        closedId: closedDoor,
        openId: openDoor,
      });
    }
  }
  return doors;
}

export function parseKeyItemIds(lua) {
  const match = stripComments(lua).match(/keysID\s*=\s*\{([^}]*)\}/);
  if (!match) throw new Error("keysID table not found in doors source");
  const ids = [...match[1].matchAll(/\d+/g)].map((raw) => Number(raw[0]));
  if (ids.length === 0 || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error("keysID table is empty or invalid");
  }
  return ids;
}

/**
 * Parses the otservbr startup table door_level.lua, where each `[1000+n]`
 * action id block lists the map positions of doors requiring level n.
 */
export function parseLevelDoorPositions(lua) {
  const stripped = stripComments(lua);
  const requirements = new Map();
  for (const block of stripped.matchAll(/\[(\d+)\]\s*=\s*\{/g)) {
    const actionId = Number(block[1]);
    const requiredLevel = actionId - 1_000;
    if (requiredLevel <= 0 || requiredLevel > 2_000) {
      throw new Error(`level door action id ${actionId} is out of range`);
    }
    let depth = 1;
    let index = block.index + block[0].length;
    while (index < stripped.length && depth > 0) {
      const character = stripped[index];
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
      index += 1;
    }
    if (depth !== 0) throw new Error("unbalanced braces in door_level source");
    const body = stripped.slice(block.index + block[0].length, index - 1);
    for (const position of body.matchAll(
      /\{\s*x\s*=\s*(\d+)\s*,\s*y\s*=\s*(\d+)\s*,\s*z\s*=\s*(\d+)\s*\}/g,
    )) {
      const key = `${position[1]}:${position[2]}:${position[3]}`;
      if (!requirements.has(key)) {
        requirements.set(key, {
          x: Number(position[1]),
          y: Number(position[2]),
          z: Number(position[3]),
          level: requiredLevel,
        });
      }
    }
  }
  if (requirements.size === 0) {
    throw new Error("no level door positions found in door_level source");
  }
  return [...requirements.values()];
}
