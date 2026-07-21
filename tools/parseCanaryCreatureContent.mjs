const DIRECTIONS = ["north", "east", "south", "west"];
const MONSTER_FIELDS = new Set([
  "description",
  "experience",
  "outfit",
  "health",
  "maxHealth",
  "corpse",
  "speed",
  "manaCost",
  "changeTarget",
  "light",
  "strategiesTarget",
  "flags",
  "attacks",
  "defenses",
  "elements",
  "immunities",
  "maxSummons",
  "summon",
  "summons",
  "voices",
  "loot",
]);
const MONSTER_FLAG_FIELDS = new Set([
  "attackable",
  "hostile",
  "pushable",
  "summonable",
  "convinceable",
  "illusionable",
  "canPushItems",
  "canPushCreatures",
  "targetDistance",
  "runHealth",
  "staticAttackChance",
  "healthHidden",
]);
const LOCALLY_SUPPORTED_MONSTER_ABILITIES = new Set([
  "combat",
  "condition",
  "drunk",
  "effect",
  "haste",
  "invisible",
  "melee",
  "outfit",
  "speed",
  "strength",
]);
const NPC_FIELDS = new Set([
  "name",
  "description",
  "health",
  "maxHealth",
  "walkInterval",
  "walkRadius",
  "outfit",
]);

class LuaReader {
  constructor(source, offset) {
    this.source = source;
    this.offset = offset;
    this.buffer = [];
  }

  peek(distance = 0) {
    while (this.buffer.length <= distance) this.buffer.push(this.readToken());
    return this.buffer[distance];
  }

  next() {
    if (this.buffer.length > 0) return this.buffer.shift();
    return this.readToken();
  }

  readToken() {
    this.skipIgnored();
    if (this.offset >= this.source.length) return { type: "eof" };
    const character = this.source[this.offset];
    if ("{},=[];()+*/^".includes(character)) {
      this.offset++;
      return { type: character };
    }
    if (character === '"' || character === "'") {
      return { type: "value", value: this.readString(character) };
    }
    const number = this.source.slice(this.offset).match(/^-?\d+(?:\.\d+)?/);
    if (number) {
      this.offset += number[0].length;
      return { type: "value", value: Number(number[0]) };
    }
    const identifier = this.source
      .slice(this.offset)
      .match(/^[A-Za-z_][A-Za-z0-9_.]*/);
    if (identifier) {
      this.offset += identifier[0].length;
      if (identifier[0] === "true") return { type: "value", value: true };
      if (identifier[0] === "false") return { type: "value", value: false };
      if (identifier[0] === "nil") return { type: "value", value: null };
      return { type: "identifier", value: identifier[0] };
    }
    throw new Error(`unsupported Lua token ${JSON.stringify(character)}`);
  }

  skipIgnored() {
    while (this.offset < this.source.length) {
      if (/\s/.test(this.source[this.offset])) {
        this.offset++;
        continue;
      }
      if (this.source.startsWith("--", this.offset)) {
        const newline = this.source.indexOf("\n", this.offset + 2);
        this.offset = newline === -1 ? this.source.length : newline + 1;
        continue;
      }
      return;
    }
  }

  readString(quote) {
    this.offset++;
    let value = "";
    while (this.offset < this.source.length) {
      const character = this.source[this.offset++];
      if (character === quote) return value;
      if (character !== "\\") {
        value += character;
        continue;
      }
      const escaped = this.source[this.offset++];
      if (escaped === "z") {
        while (/\s/.test(this.source[this.offset] ?? "")) this.offset++;
        continue;
      }
      const replacements = { n: "\n", r: "\r", t: "\t" };
      value += replacements[escaped] ?? escaped;
    }
    throw new Error("unterminated Lua string");
  }
}

function parseLuaValue(reader) {
  let value = parseLuaPrimary(reader);
  while (["+", "*", "/", "^"].includes(reader.peek().type)) {
    const operator = reader.next().type;
    const right = parseLuaPrimary(reader);
    if (typeof value === "number" && typeof right === "number") {
      if (operator === "+") value += right;
      if (operator === "*") value *= right;
      if (operator === "/") value /= right;
      if (operator === "^") value **= right;
    } else {
      value = `${String(value)} ${operator} ${String(right)}`;
    }
  }
  return value;
}

function parseLuaPrimary(reader) {
  const token = reader.next();
  if (token.type === "value") return token.value;
  if (token.type === "identifier") return token.value;
  if (token.type === "(") {
    const value = parseLuaValue(reader);
    if (reader.next().type !== ")") throw new Error("unterminated Lua expression");
    return value;
  }
  if (token.type !== "{") throw new Error("expected a literal Lua value");
  const keyed = {};
  const entries = [];
  while (reader.peek().type !== "}") {
    if (reader.peek().type === "identifier" && reader.peek(1).type === "=") {
      const key = reader.next().value;
      reader.next();
      keyed[key] = parseLuaValue(reader);
    } else if (reader.peek().type === "[") {
      reader.next();
      const key = parseLuaValue(reader);
      if (reader.next().type !== "]" || reader.next().type !== "=") {
        throw new Error("invalid literal Lua table key");
      }
      keyed[String(key)] = parseLuaValue(reader);
    } else {
      entries.push(parseLuaValue(reader));
    }
    if (reader.peek().type === "," || reader.peek().type === ";") reader.next();
  }
  reader.next();
  if (Object.keys(keyed).length === 0) return entries;
  if (entries.length > 0) keyed.$entries = entries;
  return keyed;
}

function assignment(source, variable, field) {
  const pattern = new RegExp(`\\b${variable}\\.${field}\\s*=`, "g");
  const match = pattern.exec(source);
  if (!match) return undefined;
  return parseLuaValue(new LuaReader(source, match.index + match[0].length));
}

function normalizeName(name) {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (normalized) return normalized;
  return `symbol-${[...name].map((character) =>
    character.codePointAt(0).toString(16)
  ).join("-")}`;
}

function decodeXml(value) {
  return value.replace(/&(amp|quot|apos|lt|gt);/g, (_, entity) => ({
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
  })[entity]);
}

function tagAttributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([A-Za-z][\w-]*)="([^"]*)"/g)].map((match) => [
      match[1].toLowerCase(),
      decodeXml(match[2]),
    ]),
  );
}

function requiredInteger(value, label, minimum = 0) {
  if (!/^-?\d+$/.test(value ?? "")) throw new Error(`${label} must be an integer`);
  const parsed = Number(value);
  if (parsed < minimum) throw new Error(`${label} must be at least ${minimum}`);
  return parsed;
}

function parseDirection(value, label) {
  if (value === undefined) return "south";
  if (/^[0-3]$/.test(value)) return DIRECTIONS[Number(value)];
  const normalized = value.toLowerCase();
  if (DIRECTIONS.includes(normalized)) return normalized;
  throw new Error(`${label} has invalid direction ${value}`);
}

function parseSpawns(xml, kind) {
  const groups = [];
  const groupPattern = new RegExp(`<${kind}\\b([^>]*)>([\\s\\S]*?)<\\/${kind}>`, "gi");
  let groupIndex = 0;
  for (const groupMatch of xml.matchAll(groupPattern)) {
    const group = tagAttributes(groupMatch[1]);
    const center = {
      x: requiredInteger(group.centerx, `${kind} group ${groupIndex} centerx`),
      y: requiredInteger(group.centery, `${kind} group ${groupIndex} centery`),
      z: requiredInteger(group.centerz, `${kind} group ${groupIndex} centerz`),
    };
    const radius = requiredInteger(
      group.radius,
      `${kind} group ${groupIndex} radius`,
    );
    const children = [];
    const childPattern = new RegExp(`<${kind}\\b([^>]*)\\/>`, "gi");
    let childIndex = 0;
    for (const childMatch of groupMatch[2].matchAll(childPattern)) {
      const child = tagAttributes(childMatch[1]);
      const childFloor = requiredInteger(
        child.z,
        `${kind} group ${groupIndex} child ${childIndex} z`,
      );
      if (childFloor !== center.z) {
        throw new Error(
          `${kind} group ${groupIndex} child ${childIndex} floor does not match centerz`,
        );
      }
      const name = child.name?.trim();
      if (!name) throw new Error(`${kind} spawn is missing a name`);
      children.push({
        id: `${kind}:${String(groupIndex).padStart(6, "0")}:${String(childIndex).padStart(3, "0")}`,
        kind,
        rawName: name,
        typeId: normalizeName(name),
        home: {
          x: center.x + requiredInteger(child.x, `${name} x`, -65_535),
          y: center.y + requiredInteger(child.y, `${name} y`, -65_535),
          z: center.z,
        },
        radius,
        respawnMs: requiredInteger(child.spawntime, `${name} spawntime`, 1) * 1000,
        direction: parseDirection(child.direction, name),
      });
      childIndex++;
    }
    groups.push(...children);
    groupIndex++;
  }
  return groups;
}

function definitionNames(source, kind) {
  if (kind === "monster") {
    const name = source.match(/Game\.createMonsterType\(\s*(["'])(.*?)\1\s*\)/)?.[2];
    return name ? [name] : [];
  }
  const internalName = source.match(/local\s+internalNpcName\s*=\s*(["'])(.*?)\1/)?.[2];
  const typeName = source.match(/Game\.createNpcType\(\s*(["'])(.*?)\1\s*\)/)?.[2];
  return [...new Set([internalName, typeName].filter(Boolean))];
}

function numberValue(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function primitiveRecord(value) {
  const record = {};
  for (const [key, entry] of Object.entries(objectValue(value))) {
    if (key === "$entries") continue;
    if (["string", "number", "boolean"].includes(typeof entry)) record[key] = entry;
  }
  return record;
}

function recordList(value) {
  if (Array.isArray(value)) return value.map(primitiveRecord);
  const table = objectValue(value);
  const records = [];
  const base = primitiveRecord(table);
  if (Object.keys(base).length > 0) records.push(base);
  if (Array.isArray(table.$entries)) records.push(...table.$entries.map(primitiveRecord));
  return records;
}

function outfitValue(value, context, corrections) {
  const outfit = objectValue(value);
  const feet = numberValue(outfit.lookFeet, 0);
  const correctedFeet = context.kind === "npc" &&
    context.typeId === "hagor" &&
    feet === 1156
    ? 115
    : feet;
  if (correctedFeet !== feet) {
    corrections.push({
      ...context,
      field: "feet",
      sourceValue: feet,
      importedValue: correctedFeet,
      reason: "Pinned Canary value exceeds the Tibia outfit palette.",
    });
  }
  const parsed = {
    lookType: numberValue(outfit.lookType, 0),
    head: numberValue(outfit.lookHead, 0),
    body: numberValue(outfit.lookBody, 0),
    legs: numberValue(outfit.lookLegs, 0),
    feet: correctedFeet,
    addons: numberValue(outfit.lookAddons, 0),
  };
  if (numberValue(outfit.lookTypeEx, 0) > 0) {
    parsed.lookTypeEx = numberValue(outfit.lookTypeEx, 0);
  }
  return parsed;
}

function ignoredAssignments(source, variable, supported) {
  return [
    ...new Set(
      [...source.matchAll(new RegExp(`\\b${variable}\\.([A-Za-z][A-Za-z0-9_]*)\\s*=`, "g"))]
        .map((match) => match[1])
        .filter((field) => !supported.has(field)),
    ),
  ].sort();
}

function unsupportedMonsterAbilities(records, field) {
  const names = new Map();
  for (const record of records) {
    if (typeof record.name !== "string") continue;
    const name = record.name.trim();
    const normalized = name.toLowerCase();
    if (!name || LOCALLY_SUPPORTED_MONSTER_ABILITIES.has(normalized)) continue;
    names.set(normalized, name);
  }
  return [...names.values()]
    .sort((left, right) => left.localeCompare(right))
    .map((name) => `${field}.registeredSpell:${name}`);
}

function parseMonsterDefinition(definition, name, context, corrections) {
  const source = definition.source;
  const flags = objectValue(assignment(source, "monster", "flags"));
  const strategy = objectValue(assignment(source, "monster", "strategiesTarget"));
  const changeTarget = objectValue(
    assignment(source, "monster", "changeTarget"),
  );
  const light = objectValue(assignment(source, "monster", "light"));
  const elementRecords = recordList(assignment(source, "monster", "elements"));
  const immunityRecords = recordList(assignment(source, "monster", "immunities"));
  const attacks = recordList(assignment(source, "monster", "attacks"));
  const defenses = recordList(assignment(source, "monster", "defenses"));
  const voices = recordList(assignment(source, "monster", "voices"));
  const summon = objectValue(assignment(source, "monster", "summon"));
  const nestedSummons = recordList(summon.summons);
  const summons = nestedSummons.length > 0
    ? nestedSummons
    : recordList(assignment(source, "monster", "summons"));
  const inferredMaxSummons = summons.reduce(
    (total, entry) => total + numberValue(entry.count, 1),
    0,
  );
  const health = numberValue(assignment(source, "monster", "health"), 1);
  return {
    type: {
      id: normalizeName(name),
      name,
      description: String(assignment(source, "monster", "description") ?? name),
      outfit: outfitValue(
        assignment(source, "monster", "outfit"),
        context,
        corrections,
      ),
      health,
      maxHealth: numberValue(assignment(source, "monster", "maxHealth"), health),
      speed: numberValue(assignment(source, "monster", "speed"), 100),
      manaCost: numberValue(assignment(source, "monster", "manaCost"), 0),
      changeTarget: {
        intervalMs: numberValue(changeTarget.interval, 4_000),
        chance: numberValue(changeTarget.chance, 0),
      },
      light: {
        intensity: numberValue(light.level, 0),
        color: numberValue(light.color, 0),
      },
      experience: numberValue(assignment(source, "monster", "experience"), 0),
      corpseItemTypeId: numberValue(assignment(source, "monster", "corpse"), 0),
      flags: {
        attackable: booleanValue(flags.attackable, true),
        hostile: booleanValue(flags.hostile),
        pushable: booleanValue(flags.pushable, true),
        summonable: booleanValue(flags.summonable),
        convinceable: booleanValue(flags.convinceable),
        illusionable: booleanValue(flags.illusionable),
        canPushItems: booleanValue(flags.canPushItems),
        canPushCreatures: booleanValue(flags.canPushCreatures),
        targetDistance: numberValue(flags.targetDistance, 1),
        runHealth: numberValue(flags.runHealth, 0),
        staticAttackChance: numberValue(flags.staticAttackChance, 95),
        healthHidden: booleanValue(flags.healthHidden),
      },
      targetStrategy: {
        nearest: numberValue(strategy.nearest, 100),
        health: numberValue(strategy.health, 0),
        damage: numberValue(strategy.damage, 0),
        random: numberValue(strategy.random, 0),
      },
      attacks,
      defenses,
      elements: Object.fromEntries(
        elementRecords
          .filter((entry) => typeof entry.type === "string" && typeof entry.percent === "number")
          .map((entry) => [entry.type, entry.percent]),
      ),
      immunities: immunityRecords
        .filter((entry) => entry.condition === true || entry.combat === true)
        .map((entry) => String(entry.type)),
      maxSummons: numberValue(
        summon.maxSummons,
        numberValue(
          assignment(source, "monster", "maxSummons"),
          inferredMaxSummons,
        ),
      ),
      summons,
      voices,
      loot: recordList(assignment(source, "monster", "loot")),
    },
    ignored: [
      ...ignoredAssignments(source, "monster", MONSTER_FIELDS),
      ...Object.keys(flags)
        .filter(
          (field) =>
            field !== "$entries" && !MONSTER_FLAG_FIELDS.has(field),
        )
        .map((field) => `flags.${field}`),
      ...unsupportedMonsterAbilities(attacks, "attacks"),
      ...unsupportedMonsterAbilities(defenses, "defenses"),
    ].sort(),
    sourcePath: definition.path,
  };
}

function parseNpcDefinition(definition, name, context, corrections) {
  const source = definition.source;
  const health = numberValue(assignment(source, "npcConfig", "health"), 100);
  const maxHealthValue = assignment(source, "npcConfig", "maxHealth");
  return {
    type: {
      id: normalizeName(name),
      name,
      outfit: outfitValue(
        assignment(source, "npcConfig", "outfit"),
        context,
        corrections,
      ),
      health,
      maxHealth: numberValue(maxHealthValue, health),
      speed: 100,
      walkIntervalMs: numberValue(assignment(source, "npcConfig", "walkInterval"), 2000),
      walkRadius: numberValue(assignment(source, "npcConfig", "walkRadius"), 0),
    },
    ignored: ignoredAssignments(source, "npcConfig", NPC_FIELDS),
    callbacks: [...source.matchAll(/\bnpcType\.(on[A-Za-z]+)\s*=/g)].map((match) => match[1]),
    sourcePath: definition.path,
  };
}

function indexDefinitions(definitions, kind) {
  const indexed = new Map();
  const pathIndexed = new Map();
  const duplicates = [];
  for (const definition of definitions) {
    const names = definitionNames(definition.source, kind);
    if (names.length === 0) continue;
    for (const name of names) {
      const id = normalizeName(name);
      const entries = indexed.get(id) ?? [];
      entries.push({ ...definition, name });
      indexed.set(id, entries);
      if (entries.length === 2) {
        duplicates.push({ kind, typeId: id, paths: entries.map((entry) => entry.path) });
      } else if (entries.length > 2) {
        duplicates.find((duplicate) => duplicate.typeId === id).paths.push(definition.path);
      }
    }
    const pathId = normalizeName(
      definition.path.split("/").at(-1)?.replace(/\.lua$/, "") ?? "",
    );
    const pathEntries = pathIndexed.get(pathId) ?? [];
    pathEntries.push({ ...definition, name: names[0] });
    pathIndexed.set(pathId, pathEntries);
  }
  return { indexed, pathIndexed, duplicates };
}

/** Parses static creature content without executing Canary Lua. */
export function parseCanaryCreatureContent(options) {
  const allMonsterSlots = parseSpawns(options.monsterSpawnXml, "monster");
  const allNpcSlots = parseSpawns(options.npcSpawnXml, "npc");
  const selected = options.bounds
    ? [...allMonsterSlots, ...allNpcSlots].filter((slot) =>
        slot.home.z === options.bounds.z &&
        Math.abs(slot.home.x - options.bounds.centerX) <= options.bounds.radius &&
        Math.abs(slot.home.y - options.bounds.centerY) <= options.bounds.radius
      )
    : [...allMonsterSlots, ...allNpcSlots];
  const monsterIndex = indexDefinitions(options.monsterDefinitions, "monster");
  const npcIndex = indexDefinitions(options.npcDefinitions, "npc");
  const parsedMonsters = new Map();
  const parsedNpcs = new Map();
  const aliases = [];
  const ambiguousDefinitions = [];
  const unsupported = [];
  const invisibleAppearances = [];
  const appearanceCorrections = [];
  for (const slot of selected) {
    const definitions = slot.kind === "monster" ? monsterIndex.indexed : npcIndex.indexed;
    const index = slot.kind === "monster" ? monsterIndex : npcIndex;
    const matches = definitions.get(slot.typeId) ?? index.pathIndexed.get(slot.typeId);
    if (!matches) {
      throw new Error(`${slot.kind} spawn ${slot.id} references unknown type ${slot.rawName}`);
    }
    const definition = matches.find((match) =>
      normalizeName(match.path.split("/").at(-1)?.replace(/\.lua$/, "") ?? "") === slot.typeId
    ) ?? matches[0];
    if (!definition) throw new Error(`${slot.kind} spawn ${slot.id} has no type`);
    if (matches.length > 1 && !ambiguousDefinitions.some((entry) => entry.typeId === slot.typeId)) {
      ambiguousDefinitions.push({
        kind: slot.kind,
        typeId: slot.typeId,
        selectedPath: definition.path,
        candidatePaths: matches.map((match) => match.path),
      });
    }
    if (definition.name !== slot.rawName) {
      aliases.push({ placement: slot.rawName, definition: definition.name, typeId: slot.typeId });
    }
    const target = slot.kind === "monster" ? parsedMonsters : parsedNpcs;
    if (target.has(slot.typeId)) continue;
    const context = {
      kind: slot.kind,
      typeId: slot.typeId,
      sourcePath: definition.path,
    };
    const parsed = slot.kind === "monster"
      ? parseMonsterDefinition(
          definition,
          definition.name,
          context,
          appearanceCorrections,
        )
      : parseNpcDefinition(
          definition,
          definition.name,
          context,
          appearanceCorrections,
        );
    parsed.type.id = slot.typeId;
    parsed.type.name = slot.rawName;
    if (
      parsed.type.outfit.lookType <= 0 &&
      !parsed.type.outfit.lookTypeEx &&
      !invisibleAppearances.some((entry) => entry.typeId === slot.typeId)
    ) {
      invisibleAppearances.push({
        kind: slot.kind,
        typeId: slot.typeId,
        sourcePath: parsed.sourcePath,
      });
    }
    target.set(slot.typeId, parsed.type);
    if (parsed.ignored.length > 0 || parsed.callbacks?.length > 0) {
      unsupported.push({
        kind: slot.kind,
        typeId: slot.typeId,
        sourcePath: parsed.sourcePath,
        ignoredAssignments: parsed.ignored,
        proceduralCallbacks: parsed.callbacks ?? [],
      });
    }
  }
  const duplicates = [];
  const seenPlacements = new Map();
  const outOfMap = [];
  const blocked = [];
  const slots = selected.map(({ rawName: _rawName, ...slot }) => {
    const key = `${slot.kind}:${slot.typeId}:${slot.home.x},${slot.home.y},${slot.home.z}`;
    const previous = seenPlacements.get(key);
    if (previous) duplicates.push({ first: previous, duplicate: slot.id });
    else seenPlacements.set(key, slot.id);
    const tile = options.tileAt?.(slot.home) ?? "walkable";
    if (tile === "missing") outOfMap.push(slot.id);
    if (tile === "blocked") blocked.push(slot.id);
    return { ...slot, enabled: tile === "walkable" };
  });
  return {
    monsterTypes: [...parsedMonsters.values()].sort((left, right) => left.id.localeCompare(right.id)),
    npcTypes: [...parsedNpcs.values()].sort((left, right) => left.id.localeCompare(right.id)),
    slots,
    report: {
      fullPlacementCounts: {
        monsters: allMonsterSlots.length,
        npcs: allNpcSlots.length,
      },
      curatedPlacementCounts: {
        monsters: slots.filter((slot) => slot.kind === "monster").length,
        npcs: slots.filter((slot) => slot.kind === "npc").length,
      },
      aliases,
      duplicates,
      duplicateDefinitions: [...monsterIndex.duplicates, ...npcIndex.duplicates],
      ambiguousDefinitions,
      outOfMap,
      blocked,
      unsupportedDefinitions: unsupported,
      invisibleAppearances,
      appearanceCorrections,
      fullPlacementsEnabled: options.bounds === null,
    },
  };
}
