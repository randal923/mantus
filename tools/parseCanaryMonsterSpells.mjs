const DAMAGE_TYPES = {
  COMBAT_PHYSICALDAMAGE: "physical",
  COMBAT_ENERGYDAMAGE: "energy",
  COMBAT_EARTHDAMAGE: "earth",
  COMBAT_FIREDAMAGE: "fire",
  COMBAT_ICEDAMAGE: "ice",
  COMBAT_HOLYDAMAGE: "holy",
  COMBAT_DEATHDAMAGE: "death",
  COMBAT_LIFEDRAIN: "life-drain",
  COMBAT_LIFEDRAINDAMAGE: "life-drain",
  COMBAT_MANADRAIN: "mana-drain",
  COMBAT_MANADRAINDAMAGE: "mana-drain",
  COMBAT_DROWNDAMAGE: "drown",
  COMBAT_HEALING: "healing",
  COMBAT_NONE: null,
  COMBAT_PHYSICALDAMAGEDAMAGE: "physical",
};

const CONDITION_TYPES = {
  CONDITION_PARALYZE: "paralyze",
  CONDITION_POISON: "poison",
  CONDITION_FIRE: "fire",
  CONDITION_ENERGY: "energy",
  CONDITION_DROWN: "drown",
  CONDITION_CURSED: "curse",
  CONDITION_BLEEDING: "bleeding",
  CONDITION_DAZZLED: "dazzled",
  CONDITION_FEARED: "fear",
  CONDITION_ROOTED: "root",
  CONDITION_INVISIBLE: "invisible",
  CONDITION_ATTRIBUTES: "attributes",
};

const CONDITION_DAMAGE_TYPES = {
  poison: "earth",
  fire: "fire",
  energy: "energy",
  drown: "drown",
  curse: "death",
  bleeding: "physical",
  dazzled: "holy",
};

const SPECIAL_BEHAVIORS = {
  aggressivelavawave: {
    targetRule: {
      kind: "named-monsters",
      names: [
        "the baron from below",
        "the hungry baron from below",
        "the duke of the depths",
        "the fire empowered duke",
        "fiery heart",
        "aggressive lava",
      ],
      excludeSameName: true,
      damageType: "healing",
      minimum: 0,
      maximum: 650,
    },
  },
  "frozen minion beam": {
    targetRule: {
      kind: "players-damage-monsters-heal",
      damageType: "ice",
      minimum: 200,
      maximum: 700,
    },
  },
  "frozen minion heal": {
    targetRule: {
      kind: "monsters-only-heal",
      damageType: "healing",
      minimum: 100,
      maximum: 200,
    },
  },
  "frozen minion wave": {
    targetRule: {
      kind: "players-damage-monsters-heal",
      damageType: "ice",
      minimum: 200,
      maximum: 700,
    },
  },
  "heal monster": {
    targetRule: {
      kind: "monsters-only-heal",
      damageType: "healing",
      minimum: 100,
      maximum: 300,
    },
  },
  "minotaur cult prophet mass healing": {
    targetRule: {
      kind: "named-monsters",
      names: [
        "minotaur cult prophet",
        "minotaur cult follower",
        "minotaur cult zealot",
      ],
      includeCaster: true,
      damageType: "healing",
      minimum: 200,
      maximum: 350,
    },
  },
  ravennouslavalurkertarget: {
    targetRule: {
      kind: "named-monsters",
      names: ["lost gnome", "gnome pack crawler"],
      damageType: "fire",
      minimum: 0,
      maximum: 1_000,
    },
  },
  ravennouslavalurkerwave: {
    targetRule: {
      kind: "named-monsters",
      names: ["lost gnome", "gnome pack crawler"],
      damageType: "fire",
      minimum: 0,
      maximum: 1_000,
    },
  },
  "glooth anemone summon": {
    summon: { typeId: "glooth-blob", maxCount: 1 },
  },
  "salamander trainer summon": {
    summon: { typeId: "troll-trained-salamander", maxCount: 1 },
  },
  "destroy magic walls": { destroyMagicWalls: true },
  "spider queen wrap": {
    questAction: "spider-queen-wrap",
  },
  "energy beam": { monsterNoOp: true },
};

/** Parses registered spells used by monsters without executing Canary Lua. */
export function parseCanaryMonsterSpells(definitions, constants = {}, areas = {}) {
  return definitions
    .flatMap((definition) => {
      const name = spellName(definition.source);
      return name ? [parseDefinition(definition, name, constants, areas)] : [];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function parseDefinition(definition, name, constants, areas) {
  const source = stripComments(definition.source);
  const normalizedName = name.toLowerCase();
  const damageConstant = lastParameter(source, "COMBAT_PARAM_TYPE");
  const damageType = DAMAGE_TYPES[damageConstant] ?? null;
  const effect = visualValue(
    lastParameter(source, "COMBAT_PARAM_EFFECT"),
    constants,
  );
  const missile = visualValue(
    lastParameter(source, "COMBAT_PARAM_DISTANCEEFFECT"),
    constants,
  );
  const area = parseArea(source, areas);
  const target = parseTarget(source);
  const conditions = parseConditions(source);
  const dispel = CONDITION_TYPES[lastParameter(source, "COMBAT_PARAM_DISPEL")] ?? null;
  const chain = parseChain(source, constants);
  const phases = parsePhases(normalizedName, source, areas);
  const pathEffect = normalizedName.startsWith("single") && normalizedName.endsWith("chain")
    ? effect
    : null;
  const special = SPECIAL_BEHAVIORS[normalizedName] ?? {};
  const unsupportedReasons = [];

  if (
    !damageType &&
    conditions.length === 0 &&
    !dispel &&
    !chain &&
    !special.summon &&
    !special.destroyMagicWalls &&
    !special.targetRule &&
    !special.questAction
  ) {
    unsupportedReasons.push("spell has no imported gameplay operation");
  }
  if (/addEvent\(/.test(source) && phases.length === 0 && normalizedName !== "soulwars fear" && !special.questAction) {
    unsupportedReasons.push("unreviewed delayed callback");
  }
  if (/teleportTo\(|setStorageValue\(/.test(source) && !special.questAction) {
    unsupportedReasons.push("unreviewed quest mutation");
  }

  return {
    name: normalizedName,
    sourcePath: definition.path,
    supported: unsupportedReasons.length === 0,
    unsupportedReasons,
    behavior: {
      damageType,
      effect,
      missile,
      area,
      target,
      conditions,
      dispel,
      chain,
      phases,
      pathEffect,
      ...special,
    },
  };
}

function spellName(source) {
  return source.match(/(?:spell|rune):name\(\s*(["'])(.*?)\1\s*\)/)?.[2] ?? null;
}

function parseTarget(source) {
  if (/(?:spell|rune):needTarget\(\s*true\s*\)/.test(source)) return "target";
  if (/spell:needCasterTargetOrDirection\(\s*true\s*\)/.test(source)) {
    return "target";
  }
  if (/\brune\s*=\s*Spell\(\s*["']rune["']\s*\)/.test(source)) {
    return "target";
  }
  if (/spell:needDirection\(\s*true\s*\)/.test(source)) return "direction";
  if (/spell:isSelfTarget\(\s*true\s*\)/.test(source)) return "self";
  return "self";
}

function parseArea(source, areas) {
  const calls = [...source.matchAll(
    /createCombatArea\(\s*([A-Za-z_][A-Za-z0-9_]*|\{)(?:\s*,\s*([A-Za-z_][A-Za-z0-9_]*))?/g,
  )];
  const call = calls[0];
  if (!call) return { shape: "single" };
  let argument = call[1];
  let diagonalArgument = call[2];
  if (argument === "{") {
    const table = tableAt(source, (call.index ?? 0) + call[0].lastIndexOf("{"));
    return areaFromTable(table, /spell:needDirection\(\s*true\s*\)/.test(source));
  }
  if (!assignedTable(source, argument) && !areas[argument]) {
    const helperCall = source.match(
      /(?:local\s+)?combat\s*=\s*[A-Za-z_][A-Za-z0-9_]*\(\s*(AREA_[A-Z0-9_]+)(?:\s*,\s*(AREA[A-Z0-9_]+))?/,
    );
    if (helperCall) {
      argument = helperCall[1];
      diagonalArgument = helperCall[2];
    }
  }
  const table = assignedTable(source, argument);
  const area = table
    ? areaFromTable(table, /spell:needDirection\(\s*true\s*\)/.test(source))
    : areaForConstant(
        argument,
        areas,
        /spell:needDirection\(\s*true\s*\)/.test(source),
      );
  if (area.shape !== "tiles" || !diagonalArgument) return area;
  const diagonalTable = assignedTable(source, diagonalArgument);
  const diagonal = diagonalTable
    ? areaFromTable(diagonalTable, true)
    : areaForConstant(diagonalArgument, areas, true);
  return diagonal.shape === "tiles"
    ? { ...area, diagonalOffsets: diagonal.offsets }
    : area;
}

function parsePhases(name, source, areas) {
  if (name !== "foamsplash") {
    if (name === "soulwars fear") return [{ delayMs: 2_000 }];
    return [];
  }
  const combatAreas = [];
  for (const match of source.matchAll(/(?:local\s+)?(combat\d*)\s*=\s*Combat\(\)/g)) {
    const variable = match[1];
    const areaMatch = source.match(
      new RegExp(`${variable}:setArea\\(createCombatArea\\(\\s*(\\{|AREA_[A-Z0-9_]+|[A-Za-z_][A-Za-z0-9_]*)`),
    );
    if (!areaMatch) continue;
    let area;
    if (areaMatch[1] === "{") {
      area = areaFromTable(
        tableAt(source, (areaMatch.index ?? 0) + areaMatch[0].lastIndexOf("{")),
        false,
      );
    } else {
      const table = assignedTable(source, areaMatch[1]);
      area = table
        ? areaFromTable(table, false)
        : areaForConstant(areaMatch[1], areas, false);
    }
    combatAreas.push({ variable, area });
  }
  return combatAreas.map((entry, index) => ({
    delayMs: (index + 1) * 1_000,
    area: entry.area,
  }));
}

function parseConditions(source) {
  const parsed = [];
  for (const match of source.matchAll(/(?:local\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*Condition\(\s*(CONDITION_[A-Z0-9_]+)\s*\)/g)) {
    const variable = match[1];
    const type = CONDITION_TYPES[match[2]];
    if (!type) continue;
    const parameter = (name) => conditionParameter(source, variable, name);
    const durationMs = parameter("CONDITION_PARAM_TICKS") ?? inferredDamageDuration(source, variable) ?? 5_000;
    const condition = { type, durationMs };
    if (type === "paralyze") {
      const formula = source.match(
        new RegExp(`${variable}:setFormula\\(\\s*(-?\\d+(?:\\.\\d+)?)\\s*,\\s*(-?\\d+(?:\\.\\d+)?)\\s*,\\s*(-?\\d+(?:\\.\\d+)?)`),
      );
      if (formula) {
        condition.speedPercentMinimum = Math.round(Math.abs(Number(formula[1])) * 100);
        condition.speedPercentMaximum = Math.round(Math.abs(Number(formula[3])) * 100);
      }
    }
    if (type === "attributes") {
      condition.attributes = parseAttributes(source, variable);
    }
    const tickDamage = parseTickDamage(source, variable, type);
    if (tickDamage) condition.tickDamage = tickDamage;
    parsed.push(condition);
  }
  return deduplicateConditions(parsed);
}

function parseAttributes(source, variable) {
  const fields = {
    CONDITION_PARAM_SKILL_MELEEPERCENT: "meleePercent",
    CONDITION_PARAM_SKILL_DISTANCEPERCENT: "distancePercent",
    CONDITION_PARAM_SKILL_DEFENSEPERCENT: "defensePercent",
    CONDITION_PARAM_STAT_MAGICPOINTSPERCENT: "magicLevelPercent",
    CONDITION_PARAM_STAT_MAGICPOINTS: "magicLevelDelta",
  };
  const attributes = {};
  for (const [parameter, field] of Object.entries(fields)) {
    const raw = conditionParameterRaw(source, variable, parameter);
    if (!raw) continue;
    const literal = Number(raw);
    if (Number.isFinite(literal)) {
      attributes[field] = { minimum: literal, maximum: literal };
      continue;
    }
    if (/^[ijk]$/.test(raw)) {
      const bounds = loopBounds(source, raw);
      if (bounds) attributes[field] = bounds;
    }
  }
  return attributes;
}

function parseTickDamage(source, variable, type) {
  const call = source.match(
    new RegExp(`${variable}:addDamage\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*-?([^\\s,)]+)\\s*\\)`),
  );
  if (!call) return null;
  const count = Number(call[1]);
  const intervalMs = Number(call[2]);
  const amount = Number(call[3]);
  const usesDamageVariable = new RegExp(`${variable}:addDamage\\([^)]*-damage`).test(source);
  if (!usesDamageVariable) {
    if (!Number.isFinite(amount)) return null;
    return {
      damageType: CONDITION_DAMAGE_TYPES[type] ?? "physical",
      intervalMs,
      count,
      minimum: amount,
      maximum: amount,
      multiplier: 1,
    };
  }
  const baseVariable = source.match(/local\s+damage\s*=\s*([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?)/)?.[1];
  const bounds = baseVariable && /^[ijk]$/.test(baseVariable)
    ? loopBounds(source, baseVariable)
    : null;
  const multiplier = Number(source.match(/damage\s*=\s*damage\s*\*\s*(\d+(?:\.\d+)?)/)?.[1] ?? 1);
  const extraCount = Number(source.match(/for\s+[A-Za-z_]\w*\s*=\s*1\s*,\s*(\d+)\s*do\s*\n\s*damage\s*=/)?.[1] ?? 0);
  return {
    damageType: CONDITION_DAMAGE_TYPES[type] ?? "physical",
    intervalMs,
    count: 1 + extraCount,
    minimum: bounds?.minimum ?? Number(baseVariable ?? amount),
    maximum: bounds?.maximum ?? Number(baseVariable ?? amount),
    multiplier,
  };
}

function inferredDamageDuration(source, variable) {
  const tick = parseTickDamage(source, variable, "curse");
  return tick ? tick.intervalMs * tick.count : null;
}

function parseChain(source, constants) {
  if (!/CALLBACK_PARAM_CHAINVALUE/.test(source)) return null;
  const values = source.match(/function\s+getChainValue\([^)]*\)[\s\S]*?return\s+(\d+)\s*,\s*(\d+)\s*,\s*(true|false)/);
  if (!values) return null;
  return {
    additionalTargets: Number(values[1]),
    range: Number(values[2]),
    backtracking: values[3] === "true",
    effect: visualValue(lastParameter(source, "COMBAT_PARAM_CHAIN_EFFECT"), constants),
    playersOnly: /CALLBACK_PARAM_CHAINPICKER/.test(source),
  };
}

function deduplicateConditions(conditions) {
  const seen = new Set();
  return conditions.filter((condition) => {
    const key = JSON.stringify(condition);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function loopBounds(source, variable) {
  const match = source.match(
    new RegExp(`for\\s+${variable}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)\\s*,\\s*(-?\\d+(?:\\.\\d+)?)\\s*do`),
  );
  return match
    ? { minimum: Number(match[1]), maximum: Number(match[2]) }
    : null;
}

function conditionParameter(source, variable, name) {
  const raw = conditionParameterRaw(source, variable, name);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function conditionParameterRaw(source, variable, name) {
  return source.match(
    new RegExp(`${variable}:setParameter\\(\\s*${name}\\s*,\\s*([^\\s,)]+)`),
  )?.[1] ?? null;
}

function lastParameter(source, name) {
  const values = [...source.matchAll(
    new RegExp(`:setParameter\\(\\s*${name}\\s*,\\s*([^\\s,)]+)`, "g"),
  )];
  return values.at(-1)?.[1] ?? null;
}

function visualValue(value, constants) {
  if (!value) return null;
  const literal = Number(value);
  if (Number.isInteger(literal) && literal >= 0) return literal;
  const constant = constants[value];
  return Number.isInteger(constant) && constant >= 0 ? constant : value;
}

function areaForConstant(constant, areas, directional) {
  const offsets = areas[constant];
  if (offsets) return { shape: "tiles", offsets, directional };
  return { shape: "single" };
}

function assignedTable(source, variable) {
  const match = new RegExp(`(?:local\\s+)?${variable}\\s*=\\s*\\{`).exec(source);
  if (!match) return null;
  return tableAt(source, match.index + match[0].lastIndexOf("{"));
}

function tableAt(source, start) {
  if (source[start] !== "{") return null;
  let depth = 0;
  for (let index = start; index < source.length; index++) {
    if (source[index] === "{") depth++;
    if (source[index] === "}") depth--;
    if (depth === 0) return source.slice(start, index + 1);
  }
  return null;
}

function areaFromTable(table, directional) {
  if (!table) return { shape: "single" };
  const rows = [...table.matchAll(/\{\s*([0-3,\s]+)\s*\}/g)].map((match) =>
    match[1]
      .split(",")
      .map((value) => Number(value.trim()))
      .filter(Number.isInteger)
  );
  const centerY = rows.findIndex((row) => row.includes(3) || row.includes(2));
  const centerX = centerY >= 0
    ? rows[centerY].findIndex((value) => value === 3 || value === 2)
    : -1;
  if (centerX < 0 || centerY < 0) return { shape: "single" };
  const offsets = rows.flatMap((row, y) =>
    row.flatMap((value, x) =>
      value === 1 || value === 3
        ? [{ x: x - centerX, y: y - centerY }]
        : []
    )
  );
  return { shape: "tiles", offsets, directional };
}

function stripComments(source) {
  return source
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}
