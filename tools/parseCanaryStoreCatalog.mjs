// Reads Canary's `data/modules/scripts/gamestore/catalog/*.lua` without
// executing it. Each module is a `return { ... }` table describing one store
// category and its offers.
//
// The files are data, but not *only* data: `premium_time.lua` builds its
// names with `string.format` and branches on `configManager`, and every offer
// type is a `GameStore.OfferTypes.X` constant rather than a literal. So the
// parser evaluates what it can (strings, numbers, booleans, nested tables,
// dotted constant paths) and reports anything else as `{ unresolved: true }`
// rather than guessing — the importer then decides whether the offer survives.

const CONSTANT_PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

class LuaReader {
  constructor(source) {
    this.source = source;
    this.index = 0;
  }

  skipTrivia() {
    for (;;) {
      const before = this.index;
      while (this.index < this.source.length && /\s/.test(this.source[this.index])) {
        this.index += 1;
      }
      if (this.source.startsWith("--[[", this.index)) {
        const end = this.source.indexOf("]]", this.index + 4);
        this.index = end === -1 ? this.source.length : end + 2;
      } else if (this.source.startsWith("--", this.index)) {
        const end = this.source.indexOf("\n", this.index);
        this.index = end === -1 ? this.source.length : end;
      }
      if (this.index === before) return;
    }
  }

  peek() {
    this.skipTrivia();
    return this.source[this.index];
  }

  expect(character) {
    if (this.peek() !== character) {
      throw new Error(
        `expected "${character}" at offset ${this.index}, found "${this.peek() ?? "<eof>"}"`,
      );
    }
    this.index += 1;
  }

  readString() {
    const quote = this.source[this.index];
    this.index += 1;
    let value = "";
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      if (character === "\\") {
        const escaped = this.source[this.index + 1];
        value +=
          escaped === "n"
            ? "\n"
            : escaped === "t"
              ? "\t"
              : escaped === "r"
                ? "\r"
                : escaped;
        this.index += 2;
        continue;
      }
      this.index += 1;
      if (character === quote) return value;
      value += character;
    }
    throw new Error("unterminated string");
  }

  /**
   * Consumes one balanced expression that is not a table — a call, an
   * operator chain, a bare identifier. Returns its source text so the caller
   * can decide whether it resolves to a constant path.
   */
  readExpression() {
    const start = this.index;
    let depth = 0;
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      if (character === "(" || character === "[") depth += 1;
      else if (character === ")" || character === "]") {
        if (depth === 0) break;
        depth -= 1;
      } else if (depth === 0 && (character === "," || character === "}")) {
        break;
      } else if (character === '"' || character === "'") {
        this.readString();
        continue;
      }
      this.index += 1;
    }
    return this.source.slice(start, this.index).trim();
  }

  readValue() {
    const character = this.peek();
    if (character === "{") return this.readTable();
    if (character === '"' || character === "'") return this.readString();

    const expression = this.readExpression();
    if (/^-?\d+(?:\.\d+)?$/.test(expression)) return Number(expression);
    if (expression === "true") return true;
    if (expression === "false") return false;
    if (expression === "nil") return null;
    if (CONSTANT_PATH.test(expression)) return { constant: expression };
    return { unresolved: true, expression };
  }

  readTable() {
    this.expect("{");
    const array = [];
    const record = {};
    let isRecord = false;
    for (;;) {
      if (this.peek() === "}") {
        this.index += 1;
        return isRecord ? record : array;
      }
      const keyMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/.exec(
        this.source.slice(this.index),
      );
      if (keyMatch) {
        this.index += keyMatch[0].length;
        isRecord = true;
        record[keyMatch[1]] = this.readValue();
      } else {
        array.push(this.readValue());
      }
      if (this.peek() === "," || this.peek() === ";") this.index += 1;
    }
  }
}

/**
 * `local name = "literal"` declarations, which the returned table then refers
 * to by name. `premium_time.lua` builds its whole description this way, and
 * reassigns it inside a `configManager` branch — the first, unconditional
 * binding is the one that matches a default configuration, so later
 * assignments are ignored.
 */
function localStringConstants(source) {
  const constants = new Map();
  const pattern = /(?:^|\n)local\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*("(?:\\.|[^"\\])*")/g;
  for (const match of source.matchAll(pattern)) {
    if (constants.has(match[1])) continue;
    const reader = new LuaReader(match[2]);
    constants.set(match[1], reader.readString());
  }
  return constants;
}

/** Replaces resolvable constant/`string.format` references in place. */
function resolveConstants(value, constants) {
  if (Array.isArray(value)) {
    return value.map((entry) => resolveConstants(entry, constants));
  }
  if (!value || typeof value !== "object") return value;
  if (typeof value.constant === "string") {
    return constants.has(value.constant) ? constants.get(value.constant) : value;
  }
  if (value.unresolved === true) {
    const call = /^string\.format\(\s*("(?:\\.|[^"\\])*")\s*((?:,\s*[A-Za-z_][A-Za-z0-9_]*\s*)*)\)$/.exec(
      value.expression,
    );
    if (!call) return value;
    const format = new LuaReader(call[1]).readString();
    const args = call[2]
      .split(",")
      .map((argument) => argument.trim())
      .filter(Boolean);
    if (!args.every((argument) => constants.has(argument))) return value;
    let index = 0;
    const formatted = format.replace(/%s/g, () => constants.get(args[index++]));
    return index === args.length ? formatted : value;
  }
  const resolved = {};
  for (const [key, entry] of Object.entries(value)) {
    resolved[key] = resolveConstants(entry, constants);
  }
  return resolved;
}

/**
 * Parses one catalog module's returned table. The `return` may be preceded by
 * arbitrary setup code (locals, conditionals), so parsing starts at the last
 * top-level `return {`, and local string constants it refers to are resolved.
 */
export function parseCanaryStoreCatalogModule(source) {
  const returnIndex = source.lastIndexOf("\nreturn {");
  const start = returnIndex === -1 ? source.indexOf("return {") : returnIndex + 1;
  if (start === -1) throw new Error("module does not return a table");
  const reader = new LuaReader(source);
  reader.index = start + "return".length;
  return resolveConstants(reader.readTable(), localStringConstants(source));
}

/** The trailing segment of a `GameStore.OfferTypes.OFFER_TYPE_X` reference. */
export function constantName(value) {
  if (!value || typeof value !== "object" || !("constant" in value)) return null;
  const segments = value.constant.split(".");
  return segments[segments.length - 1] ?? null;
}
