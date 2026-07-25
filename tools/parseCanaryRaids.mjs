const stripComments = (lua) =>
  lua.replace(/--\[\[[\s\S]*?\]\]/g, "").replace(/--[^\n]*/g, "");

const DURATION_UNITS = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Canary ParseDuration: "5s", "10m", "36h", or a plain millisecond number. */
export function parseDurationMs(value) {
  const trimmed = String(value).trim().replace(/^["']|["']$/g, "");
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  let total = 0;
  let matched = false;
  for (const match of trimmed.matchAll(/(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)/g)) {
    total += Number(match[1]) * DURATION_UNITS[match[2]];
    matched = true;
  }
  if (!matched) throw new Error(`unparsable duration: ${trimmed}`);
  return Math.round(total);
}

/**
 * Canary's raid scripts repeat stages with `for _ = 1, N do ... end`, which a
 * textual scan would count once. Expanding the loop body N times keeps the
 * imported stage list identical to the one Canary builds at load time.
 */
function expandCountedLoops(text) {
  const pattern = /\bfor\s+[A-Za-z_]\w*\s*=\s*1\s*,\s*(\d+)\s*do\b/;
  let expanded = text;
  for (let guard = 0; guard < 64; guard += 1) {
    const match = pattern.exec(expanded);
    if (!match) return expanded;
    const bodyStart = match.index + match[0].length;
    let depth = 1;
    let cursor = bodyStart;
    const blockOpener = /\b(do|then)\b|\bend\b/g;
    blockOpener.lastIndex = bodyStart;
    let token;
    while ((token = blockOpener.exec(expanded)) !== null) {
      depth += token[0] === "end" ? -1 : 1;
      if (depth === 0) {
        cursor = token.index;
        break;
      }
    }
    if (depth !== 0) throw new Error("unbalanced for loop in raid script");
    const body = expanded.slice(bodyStart, cursor);
    expanded =
      expanded.slice(0, match.index) +
      body.repeat(Number(match[1])) +
      expanded.slice(cursor + 3);
  }
  throw new Error("too many nested loops in raid script");
}

function positionsIn(text) {
  const positions = [];
  for (const match of text.matchAll(
    /Position\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g,
  )) {
    positions.push({
      x: Number(match[1]),
      y: Number(match[2]),
      z: Number(match[3]),
    });
  }
  return positions;
}

/** Body of a balanced `{ ... }` starting at `start`. */
function balanced(text, start) {
  let depth = 0;
  for (let index = start; index < text.length; index++) {
    if (text[index] === "{") depth++;
    else if (text[index] === "}") {
      depth--;
      if (depth === 0) return text.slice(start + 1, index);
    }
  }
  throw new Error("unbalanced table");
}

function parseConfig(body) {
  const config = {};
  const numberFields = [
    "minActivePlayers",
    "initialChance",
    "targetChancePerDay",
    "maxChancePerCheck",
    "maxChecksPerDay",
  ];
  for (const field of numberFields) {
    const match = new RegExp(`${field}\\s*=\\s*(-?[\\d.]+)`).exec(body);
    if (match) config[field] = Number(match[1]);
  }
  const gap = /minGapBetween\s*=\s*("[^"]*"|'[^']*'|\d+)/.exec(body);
  if (gap) config.minGapBetweenMs = parseDurationMs(gap[1]);
  const days = /allowedDays\s*=\s*\{([^}]*)\}/.exec(body);
  if (days) {
    config.allowedDays = [...days[1].matchAll(/"([A-Za-z]+)"/g)].map(
      (match) => match[1],
    );
  } else {
    const single = /allowedDays\s*=\s*"([A-Za-z]+)"/.exec(body);
    if (single) config.allowedDays = [single[1]];
  }
  return config;
}

function parseSpawnGroup(body) {
  const monsters = [];
  let cursor = 0;
  while (cursor < body.length) {
    const open = body.indexOf("{", cursor);
    if (open === -1) break;
    const entry = balanced(body, open);
    cursor = open + entry.length + 2;
    const name = /name\s*=\s*"([^"]*)"/.exec(entry);
    const amount = /amount\s*=\s*(\d+)/.exec(entry);
    if (!name || !amount) continue;
    const position = positionsIn(entry)[0];
    monsters.push({
      name: name[1],
      amount: Number(amount[1]),
      ...(position === undefined ? {} : { position }),
    });
  }
  return monsters;
}

/**
 * Parses one Canary raid revscript (data-otservbr-global/scripts/raids) into a
 * typed definition: its zone areas, roll configuration, and ordered stages.
 * Any stage method the parser does not understand is reported in
 * `unsupportedStages` rather than dropped.
 */
export function parseCanaryRaid(sourcePath, lua) {
  const text = expandCountedLoops(stripComments(lua));
  const raidHeader = /Raid\(\s*"([^"]+)"\s*,\s*\{/.exec(text);
  if (!raidHeader) return null;
  const id = raidHeader[1];
  const configStart = text.indexOf("{", raidHeader.index);
  const config = parseConfig(balanced(text, configStart));

  const areas = [];
  for (const area of text.matchAll(/:addArea\(([^;]*?)\)\s*$/gm)) {
    const corners = positionsIn(area[1]);
    if (corners.length === 2) areas.push({ from: corners[0], to: corners[1] });
  }

  const stages = [];
  const unsupportedStages = [];
  const stagePattern = /:(add[A-Za-z]+|autoAdvance)\(/g;
  let match;
  while ((match = stagePattern.exec(text)) !== null) {
    const method = match[1];
    const open = match.index + match[0].length - 1;
    if (method === "addArea") continue;
    if (method === "autoAdvance") {
      const argument = /^\(\s*("[^"]*"|'[^']*'|\d+)\s*\)/.exec(
        text.slice(open),
      );
      const last = stages.at(-1);
      if (argument && last) last.advanceAfterMs = parseDurationMs(argument[1]);
      continue;
    }
    if (method === "addBroadcast") {
      const argument = /^\(\s*"([^"]*)"/.exec(text.slice(open));
      if (!argument) {
        unsupportedStages.push(method);
        continue;
      }
      stages.push({ kind: "announce", message: argument[1] });
      continue;
    }
    if (method === "addSpawnMonsters") {
      const tableStart = text.indexOf("{", open);
      const monsters = parseSpawnGroup(balanced(text, tableStart));
      if (monsters.length === 0) {
        unsupportedStages.push(method);
        continue;
      }
      stages.push({ kind: "spawn", monsters });
      continue;
    }
    unsupportedStages.push(method);
  }

  return {
    id,
    sourcePath,
    areas,
    ...config,
    stages,
    unsupportedStages: [...new Set(unsupportedStages)],
  };
}
