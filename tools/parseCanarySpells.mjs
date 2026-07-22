const ALL_VOCATIONS = [
  "Knight",
  "Paladin",
  "Sorcerer",
  "Druid",
  "Elite Knight",
  "Royal Paladin",
  "Master Sorcerer",
  "Elder Druid",
  "Monk",
  "Exalted Monk",
];

const DAMAGE_TYPES = {
  COMBAT_PHYSICALDAMAGE: "physical",
  COMBAT_ENERGYDAMAGE: "energy",
  COMBAT_EARTHDAMAGE: "earth",
  COMBAT_FIREDAMAGE: "fire",
  COMBAT_ICEDAMAGE: "ice",
  COMBAT_HOLYDAMAGE: "holy",
  COMBAT_DEATHDAMAGE: "death",
  COMBAT_LIFEDRAIN: "life-drain",
  COMBAT_MANADRAIN: "mana-drain",
  COMBAT_HEALING: "healing",
};

const VOCATIONS = new Map(
  ALL_VOCATIONS.map((vocation) => [vocation.toLowerCase(), vocation]),
);

export function parseCanarySpells(definitions, constants = {}, areas = {}) {
  return definitions
    .map((definition) => parseDefinition(definition, constants, areas))
    .sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
}

function parseDefinition(definition, constants, areas) {
  const source = stripComments(definition.source);
  const variable = source.match(
    /local\s+(spell|rune)\s*=\s*Spell\(\s*["'](?:instant|rune)["']\s*\)/,
  )?.[1];
  const origin = variable === "rune" ? "rune" : "spell";
  const method = (name) =>
    variable ? methodArguments(source, variable, name) : null;
  const groups = stringArguments(method("group"));
  const groupCooldowns = numericArguments(method("groupCooldown"));
  const combatTypeConstant = parameter(source, "COMBAT_PARAM_TYPE");
  const damageType = combatTypeConstant
    ? (DAMAGE_TYPES[combatTypeConstant] ?? null)
    : null;
  const callback = source.match(
    /combat:setCallback\(\s*(CALLBACK_PARAM_(?:LEVELMAGIC|SKILL)VALUE)\s*,\s*["']([^"']+)["']\s*\)/,
  );
  const formula = callback
    ? parseFormula(source, callback[2], callback[1])
    : parseFixedFormula(source);
  const conjure = parseConjure(source);
  const castRules = reviewedCastRules(definition.path);
  const specialCombat =
    parseSpecialCombat(definition.path) ??
    (conjure
      ? {
          damageType: "healing",
          formula: zeroSpellFormula(),
          dispel: null,
          allowsProceduralCast: true,
        }
      : null);
  const effectConstant = parameter(source, "COMBAT_PARAM_EFFECT");
  const missileConstant = parameter(source, "COMBAT_PARAM_DISTANCEEFFECT");
  const hasArea = /combat:setArea\(/.test(source);
  const areaConstant = hasArea
    ? source.match(/createCombatArea\(\s*([A-Z0-9_]+)/)?.[1] ?? null
    : null;
  const targetKind = parseTargetKind(source, variable);
  const area = areaFor(
    areaConstant,
    areas,
    targetKind === "direction",
  );
  const declaredRange = numericArgument(method("range"), 0);
  const range =
    declaredRange ??
    (origin === "rune" || targetKind === "target" ? 7 : 0);
  const unsupportedReasons = [];

  if (!variable) unsupportedReasons.push("missing literal Spell declaration");
  if (definition.path.includes("/#")) {
    unsupportedReasons.push("example definition");
  }
  if (
    !isLiteralCombatCast(source, variable) &&
    !specialCombat?.allowsProceduralCast &&
    !castRules
  ) {
    unsupportedReasons.push("procedural cast callback");
  }
  if (!damageType && !specialCombat) {
    unsupportedReasons.push("unsupported or missing combat type");
  }
  if (!formula && !specialCombat) {
    unsupportedReasons.push("unsupported or missing combat formula");
  }
  if (/\bCondition\s*\(/.test(source) && !specialCombat) {
    unsupportedReasons.push("condition mechanics require a dedicated importer");
  }
  if (/COMBAT_PARAM_CREATEITEM/.test(source)) {
    unsupportedReasons.push("field or item creation is not implemented");
  }
  if (
    /CALLBACK_PARAM_(?:TARGETCREATURE|TARGETTILE|CHAINVALUE|CHAINPICKER)/.test(
      source,
    )
  ) {
    unsupportedReasons.push("procedural combat callback");
  }
  if (hasArea && !areaConstant) {
    unsupportedReasons.push("dynamic combat area");
  } else if (areaConstant && !area) {
    unsupportedReasons.push(`unsupported combat area ${areaConstant}`);
  }

  const cooldownMs = numericArgument(method("cooldown"), 0) ?? 0;
  const requiredLevel = numericArgument(method("level"), 0) ?? 0;
  const requiredMagicLevel = numericArgument(method("magicLevel"), 0) ?? 0;
  const manaCost = numericArgument(method("mana"), 0) ?? 0;
  const soulCost = numericArgument(method("soul"), 0) ?? 0;
  const numericId = numericArgument(method("id"), 0);
  const runeItemTypeId = numericArgument(method("runeId"), 0);
  const name = stringArguments(method("name"))[0] ?? filenameName(definition.path);
  const words = stringArguments(method("words"))[0] ?? null;

  return {
    sourcePath: definition.path,
    origin,
    numericId,
    id: slug(words ?? name),
    name,
    words,
    runeItemTypeId,
    charges: numericArgument(method("charges"), 0),
    vocations: parseVocations(method("vocation")),
    requiredLevel,
    requiredMagicLevel,
    manaCost,
    soulCost,
    groups: groups.length > 0 ? groups : ["none"],
    cooldownMs,
    groupCooldownMs: groups.map((_, index) => groupCooldowns[index] ?? 0),
    range,
    lineOfSight:
      booleanArgument(method("blockWalls"), 0) ??
      booleanArgument(method("isBlockingWalls"), 0) ??
      (origin === "rune" &&
        (booleanArgument(method("allowFarUse"), 0) ?? false)),
    targetKind,
    aggressive: booleanArgument(method("isAggressive"), 0) ?? false,
    needWeapon: booleanArgument(method("needWeapon"), 0) ?? false,
    combat: (damageType && formula) || specialCombat
      ? {
          damageType: specialCombat?.damageType ?? damageType,
          formula: specialCombat?.formula ?? formula,
          effectId:
            specialCombat?.effectId ??
            constantValue(constants, effectConstant) ??
            0,
          missileId:
            specialCombat?.missileId ??
            constantValue(constants, missileConstant),
          blockArmor:
            booleanParameter(source, "COMBAT_PARAM_BLOCKARMOR") ?? false,
          blockShield:
            booleanParameter(source, "COMBAT_PARAM_BLOCKSHIELD") ?? false,
          area: specialCombat?.area ?? area,
          dispel:
            specialCombat?.dispel ??
            conditionType(parameter(source, "COMBAT_PARAM_DISPEL")),
          ...(specialCombat?.condition
            ? { condition: specialCombat.condition }
            : {}),
          ...(specialCombat?.casterEffectId
            ? { casterEffectId: specialCombat.casterEffectId }
            : {}),
        }
      : null,
    conjure,
    castRules,
    supported: unsupportedReasons.length === 0,
    unsupportedReasons,
  };
}

function reviewedCastRules(path) {
  const rules = {
    "data/scripts/runes/intense_healing_rune.lua": {
      targetPlayerOnly: true,
      allowSelf: true,
      excludedVocations: [],
      casterEffectId: 0,
    },
    "data/scripts/runes/ultimate_healing_rune.lua": {
      targetPlayerOnly: true,
      allowSelf: true,
      excludedVocations: ["Exalted Monk"],
      casterEffectId: 0,
    },
    "data/scripts/spells/healing/heal_friend.lua": {
      targetPlayerOnly: true,
      allowSelf: false,
      excludedVocations: [],
      casterEffectId: 15,
    },
    "data/scripts/spells/healing/nature's_embrace.lua": {
      targetPlayerOnly: true,
      targetPartyMemberOnly: true,
      allowSelf: false,
      excludedVocations: [],
      casterEffectId: 15,
    },
  };
  return rules[path] ?? null;
}

function parseSpecialCombat(path) {
  const zeroFormula = zeroSpellFormula();
  const support = (condition, allowsProceduralCast = false) => ({
    damageType: "healing",
    formula: zeroFormula,
    condition,
    dispel: null,
    allowsProceduralCast,
  });
  const damageCondition = (
    type,
    damageType,
    tickIntervalMs,
    tickAmounts,
  ) => ({
    damageType,
    formula: zeroFormula,
    condition: {
      type,
      durationMs: tickIntervalMs * tickAmounts.length,
      tickIntervalMs,
      tickAmounts,
      damageType,
    },
    dispel: null,
    allowsProceduralCast: false,
  });
  const simple = {
    "data/scripts/spells/support/light.lua": support({
      type: "light",
      durationMs: 370_000,
      light: { intensity: 6, color: 215 },
    }),
    "data/scripts/spells/support/great_light.lua": support({
      type: "light",
      durationMs: 695_000,
      light: { intensity: 8, color: 215 },
    }),
    "data/scripts/spells/support/ultimate_light.lua": support({
      type: "light",
      durationMs: 1_990_000,
      light: { intensity: 8, color: 215 },
    }),
    "data/scripts/spells/support/invisible.lua": support({
      type: "invisible",
      durationMs: 200_000,
    }),
    "data/scripts/spells/support/haste.lua": support(
      {
        type: "haste",
        durationMs: 30_000,
        speedFormula: { coefficient: 1.3, base: 40 },
      },
      true,
    ),
    "data/scripts/spells/support/strong_haste.lua": support(
      {
        type: "haste",
        durationMs: 22_000,
        speedFormula: { coefficient: 1.7, base: 40 },
      },
      true,
    ),
    "data/scripts/spells/support/magic_shield.lua": support(
      {
        type: "magic-shield",
        durationMs: 180_000,
        magicShieldFormula: {
          base: 300,
          level: 7.6,
          magicLevel: 7,
        },
      },
      true,
    ),
    "data/scripts/spells/healing/recovery.lua": support({
      type: "regeneration",
      durationMs: 60_000,
      magnitude: 20,
      tickIntervalMs: 3_000,
      damageType: "healing",
    }),
    "data/scripts/spells/healing/intense_recovery.lua": support({
      type: "regeneration",
      durationMs: 60_000,
      magnitude: 40,
      tickIntervalMs: 3_000,
      damageType: "healing",
    }),
    "data/scripts/runes/paralyze_rune.lua": {
      ...support(
        {
        type: "paralyze",
        durationMs: 6_000,
        speedTarget: 40,
        },
        true,
      ),
      damageType: "earth",
      casterEffectId: 15,
    },
    "data/scripts/spells/attack/energy_beam.lua": {
      damageType: "energy",
      formula: levelMagicFormula(1.8, 11, 3, 19),
      effectId: 12,
      missileId: null,
      area: { shape: "beam", length: 5 },
      dispel: null,
      allowsProceduralCast: true,
    },
    "data/scripts/spells/attack/energy_wave.lua": {
      damageType: "energy",
      formula: levelMagicFormula(4.5, 0, 9, 0),
      effectId: 38,
      missileId: 5,
      area: { shape: "cone", length: 5, spread: 5 },
      dispel: null,
      allowsProceduralCast: true,
    },
    "data/scripts/spells/attack/great_energy_beam.lua": {
      damageType: "energy",
      formula: levelMagicFormula(4, 0, 7, 0),
      effectId: 38,
      missileId: null,
      area: { shape: "beam", length: 8 },
      dispel: null,
      allowsProceduralCast: true,
    },
    "data/scripts/runes/soul_fire.lua": damageCondition(
      "fire",
      "fire",
      2_000,
      Array(10).fill(10),
    ),
    "data/scripts/spells/attack/electrify.lua": damageCondition(
      "energy",
      "energy",
      3_000,
      Array(25).fill(45),
    ),
    "data/scripts/spells/attack/envenom.lua": damageCondition(
      "poison",
      "earth",
      3_000,
      Array(25).fill(45),
    ),
    "data/scripts/spells/attack/ignite.lua": damageCondition(
      "fire",
      "fire",
      3_000,
      Array(25).fill(45),
    ),
    "data/scripts/spells/attack/inflict_wound.lua": damageCondition(
      "bleeding",
      "physical",
      2_000,
      Array(15).fill(50),
    ),
    "data/scripts/spells/attack/curse.lua": damageCondition(
      "curse",
      "death",
      3_000,
      [
        45,
        40,
        35,
        34,
        ...Array(2).fill(33),
        ...Array(2).fill(32),
        ...Array(2).fill(31),
        ...Array(2).fill(30),
        ...Array(3).fill(29),
        ...Array(3).fill(25),
        ...Array(3).fill(24),
        ...Array(4).fill(23),
        ...Array(4).fill(20),
        ...Array(5).fill(19),
        ...Array(5).fill(15),
        ...Array(6).fill(10),
        ...Array(10).fill(5),
      ],
    ),
  };
  if (simple[path]) return simple[path];
  const dispel = conditionTypeForDispelPath(path);
  return dispel
    ? {
        damageType: "healing",
        formula: zeroFormula,
        dispel,
        allowsProceduralCast:
          path === "data/scripts/spells/support/cancel_magic_shield.lua",
      }
    : null;
}

function parseConjure(source) {
  const match = source.match(
    /:conjureItem\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/,
  );
  if (!match) return null;
  const sourceItemTypeId = Number(match[1]);
  const targetItemTypeId = Number(match[2]);
  const count = Number(match[3]);
  if (
    sourceItemTypeId < 0 ||
    sourceItemTypeId > 65_535 ||
    targetItemTypeId < 1 ||
    targetItemTypeId > 65_535 ||
    count < 1 ||
    count > 100
  ) {
    return null;
  }
  return { sourceItemTypeId, targetItemTypeId, count };
}

function zeroSpellFormula() {
  return {
    kind: "fixed",
    minimum: number(0),
    maximum: number(0),
  };
}

function levelMagicFormula(
  minimumMagicMultiplier,
  minimumConstant,
  maximumMagicMultiplier,
  maximumConstant,
) {
  const expression = (magicMultiplier, constant) =>
    binary(
      "add",
      binary(
        "add",
        binary("divide", variable("level"), number(5)),
        binary("multiply", variable("magicLevel"), number(magicMultiplier)),
      ),
      number(constant),
    );
  return {
    kind: "level-magic",
    minimum: expression(minimumMagicMultiplier, minimumConstant),
    maximum: expression(maximumMagicMultiplier, maximumConstant),
  };
}

function conditionTypeForDispelPath(path) {
  const types = {
    "data/scripts/runes/antidote_rune.lua": "poison",
    "data/scripts/spells/healing/cure_bleeding.lua": "bleeding",
    "data/scripts/spells/healing/cure_burning.lua": "fire",
    "data/scripts/spells/healing/cure_curse.lua": "curse",
    "data/scripts/spells/healing/cure_electrification.lua": "energy",
    "data/scripts/spells/healing/cure_poison.lua": "poison",
    "data/scripts/spells/support/cancel_invisibility.lua": "invisible",
    "data/scripts/spells/support/cancel_magic_shield.lua": "magic-shield",
  };
  return types[path] ?? null;
}

function parseFormula(source, callbackName, callbackType) {
  const escapedName = callbackName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(
      `function\\s+${escapedName}\\s*\\(([^)]*)\\)([\\s\\S]*?)\\nend`,
    ),
  );
  if (!match) return null;
  const body = stripComments(match[2]).trim();
  if (/\b(?:if|for|while|return\s+\w+\s*\()/.test(body)) return null;
  const parameters = match[1].split(",").map((value) => value.trim());
  const variables = new Map();
  if (callbackType === "CALLBACK_PARAM_LEVELMAGICVALUE") {
    if (parameters[1]) variables.set(parameters[1], variable("level"));
    if (parameters[2]) variables.set(parameters[2], variable("magicLevel"));
  } else {
    if (parameters[1]) variables.set(parameters[1], variable("skill"));
    if (parameters[2]) variables.set(parameters[2], variable("attack"));
  }
  const normalized = body.replaceAll(
    /[A-Za-z_][A-Za-z0-9_]*:getLevel\(\)/g,
    "level",
  );
  variables.set("level", variable("level"));
  variables.set("magicLevel", variable("magicLevel"));
  variables.set("maglevel", variable("magicLevel"));
  variables.set("skill", variable("skill"));
  variables.set("attack", variable("attack"));
  let returnLine = null;
  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const assignment = line.match(
      /^(?:local\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/,
    );
    if (assignment) {
      const expression = parseExpression(assignment[2], variables);
      if (!expression) return null;
      variables.set(assignment[1], expression);
      continue;
    }
    if (line.startsWith("return ")) {
      returnLine = line.slice("return ".length);
      continue;
    }
    return null;
  }
  if (!returnLine) return null;
  const results = splitArguments(returnLine);
  if (results.length !== 2) return null;
  const minimum = parseExpression(results[0], variables);
  const maximum = parseExpression(results[1], variables);
  if (!minimum || !maximum) return null;
  return {
    kind:
      callbackType === "CALLBACK_PARAM_LEVELMAGICVALUE"
        ? "level-magic"
        : "skill",
    minimum: absoluteExpression(minimum),
    maximum: absoluteExpression(maximum),
  };
}

function isLiteralCombatCast(source, variable) {
  if (!variable) return false;
  const match = source.match(
    new RegExp(
      `function\\s+${variable}\\.onCastSpell\\s*\\([^)]*\\)([\\s\\S]*?)\\nend`,
    ),
  );
  if (!match) return false;
  return /^return\s+combat:execute\(\s*creature\s*,\s*[A-Za-z_][A-Za-z0-9_]*\s*\)$/
    .test(stripComments(match[1]).trim());
}

function parseFixedFormula(source) {
  const match = source.match(
    /combat:setFormula\(\s*COMBAT_FORMULA_DAMAGE\s*,\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/,
  );
  if (!match) return null;
  const minimum = parseExpression(match[1], new Map());
  const maximum = parseExpression(match[3], new Map());
  if (!minimum || !maximum) return null;
  return {
    kind: "fixed",
    minimum: absoluteExpression(minimum),
    maximum: absoluteExpression(maximum),
  };
}

function parseExpression(source, variables) {
  const tokens = tokenize(source);
  if (!tokens) return null;
  let index = 0;
  const parsePrimary = () => {
    const token = tokens[index];
    if (!token) return null;
    if (token === "-") {
      index++;
      const value = parsePrimary();
      return value ? binary("multiply", number(-1), value) : null;
    }
    if (token === "(") {
      index++;
      const value = parseAdditive();
      if (tokens[index] !== ")") return null;
      index++;
      return value;
    }
    if (/^\d+(?:\.\d+)?$/.test(token)) {
      index++;
      return number(Number(token));
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
      index++;
      return variables.get(token) ?? null;
    }
    return null;
  };
  const parseMultiplicative = () => {
    let left = parsePrimary();
    while (left && (tokens[index] === "*" || tokens[index] === "/")) {
      const operator = tokens[index++] === "*" ? "multiply" : "divide";
      const right = parsePrimary();
      if (!right) return null;
      left = binary(operator, left, right);
    }
    return left;
  };
  const parseAdditive = () => {
    let left = parseMultiplicative();
    while (left && (tokens[index] === "+" || tokens[index] === "-")) {
      const operator = tokens[index++] === "+" ? "add" : "subtract";
      const right = parseMultiplicative();
      if (!right) return null;
      left = binary(operator, left, right);
    }
    return left;
  };
  const result = parseAdditive();
  return result && index === tokens.length ? result : null;
}

function tokenize(source) {
  const tokens = source.match(/\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/]/g);
  if (!tokens) return null;
  return tokens.join("") === source.replaceAll(/\s/g, "") ? tokens : null;
}

function absoluteExpression(expression) {
  if (
    expression.type === "binary" &&
    expression.operator === "multiply" &&
    expression.left.type === "number" &&
    expression.left.value === -1
  ) {
    return expression.right;
  }
  return expression;
}

function number(value) {
  return { type: "number", value };
}

function variable(name) {
  return { type: "variable", name };
}

function binary(operator, left, right) {
  return { type: "binary", operator, left, right };
}

function methodArguments(source, variable, name) {
  return source.match(
    new RegExp(`${variable}:${name}\\s*\\(([^\\n]*)\\)`),
  )?.[1] ?? null;
}

function stringArguments(source) {
  if (!source) return [];
  return [...source.matchAll(/"([^"]*)"|'([^']*)'/g)].map(
    (match) => match[1] ?? match[2],
  );
}

function numericArguments(source) {
  if (!source) return [];
  return splitArguments(source)
    .map((argument) => numericExpression(argument))
    .filter((value) => value !== null);
}

function numericArgument(source, index) {
  if (!source) return null;
  return numericExpression(splitArguments(source)[index] ?? "");
}

function numericExpression(source) {
  const expression = parseExpression(source.trim(), new Map());
  if (!expression) return null;
  return evaluateConstant(expression);
}

function evaluateConstant(expression) {
  if (expression.type === "number") return expression.value;
  if (expression.type === "variable") return null;
  const left = evaluateConstant(expression.left);
  const right = evaluateConstant(expression.right);
  if (left === null || right === null) return null;
  if (expression.operator === "add") return left + right;
  if (expression.operator === "subtract") return left - right;
  if (expression.operator === "multiply") return left * right;
  return right === 0 ? null : left / right;
}

function booleanArgument(source, index) {
  const value = splitArguments(source ?? "")[index]?.trim();
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return null;
}

function splitArguments(source) {
  const values = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index++) {
    const value = source[index];
    if (value === "(") depth++;
    if (value === ")") depth--;
    if (value === "," && depth === 0) {
      values.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  values.push(source.slice(start).trim());
  return values.filter(Boolean);
}

function parameter(source, name) {
  return source.match(
    new RegExp(`combat:setParameter\\(\\s*${name}\\s*,\\s*([A-Z0-9_]+)`),
  )?.[1] ?? null;
}

function booleanParameter(source, name) {
  const value = source.match(
    new RegExp(`combat:setParameter\\(\\s*${name}\\s*,\\s*([^\\s,)]+)`),
  )?.[1];
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return null;
}

function parseVocations(source) {
  const values = stringArguments(source)
    .map((value) => value.split(";")[0]?.trim().toLowerCase())
    .map((value) => VOCATIONS.get(value))
    .filter(Boolean);
  return values.length > 0 ? [...new Set(values)] : ALL_VOCATIONS;
}

function parseTargetKind(source, variable) {
  if (!variable) return "self";
  if (booleanArgument(methodArguments(source, variable, "isSelfTarget"), 0)) {
    return "self";
  }
  if (booleanArgument(methodArguments(source, variable, "needDirection"), 0)) {
    return "direction";
  }
  if (
    booleanArgument(
      methodArguments(source, variable, "needCasterTargetOrDirection"),
      0,
    )
  ) {
    return "target-or-direction";
  }
  if (booleanArgument(methodArguments(source, variable, "needTarget"), 0)) {
    return "target";
  }
  return originFromVariable(variable) === "rune" ? "position" : "self";
}

function originFromVariable(variable) {
  return variable === "rune" ? "rune" : "spell";
}

function areaFor(constant, areas, directional) {
  if (!constant) return { shape: "single" };
  const offsets = areas[constant];
  if (offsets) {
    return {
      shape: "tiles",
      offsets,
      directional,
    };
  }
  if (constant === "AREA_CIRCLE1X1") return { shape: "circle", radius: 1 };
  if (constant === "AREA_CIRCLE3X3") return { shape: "circle", radius: 1 };
  if (constant === "AREA_CIRCLE5X5") return { shape: "circle", radius: 2 };
  if (constant === "AREA_CIRCLE6X6") return { shape: "circle", radius: 3 };
  if (constant === "AREA_SQUARE1X1") return { shape: "circle", radius: 1 };
  if (constant === "AREA_SHORTWAVE3") {
    return { shape: "cone", length: 3, spread: 3 };
  }
  if (constant === "AREA_WAVE4") {
    return { shape: "cone", length: 4, spread: 3 };
  }
  if (constant === "AREA_WAVE6") {
    return { shape: "cone", length: 6, spread: 3 };
  }
  if (constant === "AREA_SQUAREWAVE5") {
    return { shape: "cone", length: 5, spread: 5 };
  }
  return null;
}

function conditionType(value) {
  if (value === "CONDITION_PARALYZE") return "paralyze";
  if (value === "CONDITION_POISON") return "poison";
  if (value === "CONDITION_FIRE") return "fire";
  if (value === "CONDITION_ENERGY") return "energy";
  if (value === "CONDITION_INVISIBLE") return "invisible";
  if (value === "CONDITION_CURSED") return "curse";
  if (value === "CONDITION_BLEEDING") return "bleeding";
  if (value === "CONDITION_DAZZLED") return "dazzled";
  return null;
}

function constantValue(constants, name) {
  if (!name) return null;
  const value = constants[name];
  return Number.isInteger(value) && value > 0 ? value : null;
}

function stripComments(source) {
  return source
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

function filenameName(path) {
  const filename = path.split("/").at(-1)?.replace(/\.lua$/, "") ?? "spell";
  return filename
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
