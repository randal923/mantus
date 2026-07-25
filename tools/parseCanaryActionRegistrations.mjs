const stripComments = (lua) =>
  lua.replace(/--\[\[[\s\S]*?\]\]/g, "").replace(/--[^\n]*/g, "");

const CONSTRUCTORS = [
  ["Action", "action"],
  ["MoveEvent", "movement"],
  ["CreatureEvent", "creature-event"],
];

function numbersIn(argument) {
  const numbers = [];
  for (const match of argument.matchAll(/-?\d+/g)) {
    numbers.push(Number(match[0]));
  }
  return numbers;
}

/**
 * Parses one Canary revscript file into its registrations. A file may declare
 * several by reassigning the same local, so the text is segmented at each
 * `name:register()`: everything since the previous register belongs to the
 * registration being closed.
 *
 * Selectors built from a runtime loop (`for id in pairs(table)`) cannot be
 * resolved statically; those are reported as `dynamicSelectors` so the
 * classifier can still give them a disposition instead of dropping them.
 */
export function parseCanaryActionRegistrations(sourcePath, lua) {
  const text = stripComments(lua);
  const kinds = new Map();
  for (const [constructor, kind] of CONSTRUCTORS) {
    const pattern = new RegExp(
      `(?:local\\s+)?([A-Za-z_]\\w*)\\s*=\\s*${constructor}\\s*\\(`,
      "g",
    );
    for (const match of text.matchAll(pattern)) {
      kinds.set(match[1], kind);
    }
  }
  if (kinds.size === 0) return [];

  const registrations = [];
  const cursorByName = new Map();
  const registerPattern = /([A-Za-z_]\w*)\s*:\s*register\s*\(\s*\)/g;
  for (const match of text.matchAll(registerPattern)) {
    const name = match[1];
    const kind = kinds.get(name);
    if (!kind) continue;
    const start = cursorByName.get(name) ?? 0;
    const end = match.index ?? text.length;
    cursorByName.set(name, end + match[0].length);
    const segment = text.slice(start, end);
    const selectors = { ids: [], uids: [], aids: [], positions: 0 };
    let dynamicSelectors = false;
    const selectorPattern = new RegExp(
      `${name}\\s*:\\s*(id|uid|aid|position|type)\\s*\\(([^()]*(?:\\([^()]*\\)[^()]*)*)\\)`,
      "g",
    );
    let moveEventType;
    for (const selector of segment.matchAll(selectorPattern)) {
      const [, method, rawArgument] = selector;
      const argument = rawArgument.trim();
      if (method === "type") {
        moveEventType = argument.replace(/^["']|["']$/g, "").toLowerCase();
        continue;
      }
      if (method === "position") {
        selectors.positions += 1;
        continue;
      }
      const numbers = numbersIn(argument);
      if (numbers.length === 0) {
        dynamicSelectors = true;
        continue;
      }
      if (method === "id") selectors.ids.push(...numbers);
      if (method === "uid") selectors.uids.push(...numbers);
      if (method === "aid") selectors.aids.push(...numbers);
    }
    registrations.push({
      sourcePath,
      kind,
      name,
      index: registrations.filter((entry) => entry.name === name).length,
      ...(moveEventType === undefined ? {} : { moveEventType }),
      ids: [...new Set(selectors.ids)].sort((left, right) => left - right),
      uids: [...new Set(selectors.uids)].sort((left, right) => left - right),
      aids: [...new Set(selectors.aids)].sort((left, right) => left - right),
      positionCount: selectors.positions,
      dynamicSelectors,
    });
  }
  return registrations;
}
