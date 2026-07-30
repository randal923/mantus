// Scaffolds a hand-editable override file for one catalog item, prefilled with
// the item's current generated stats, and registers it in ITEM_OVERRIDES.
// usage: node tools/createItemOverride.mjs <item-id | item name>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const overridesRoot = join(repoRoot, "server/src/item/overrides");
const registryPath = join(overridesRoot, "ITEM_OVERRIDES.ts");

const query = process.argv.slice(2).join(" ").trim();
if (!query) {
  throw new Error("usage: node tools/createItemOverride.mjs <item-id | name>");
}

const catalog = JSON.parse(
  readFileSync(join(repoRoot, "server/data/item-catalog.json"), "utf8"),
);
const item = findItem(catalog.items, query);
const slug = kebabCase(item.name);
const exportName = camelCase(slug);
const category = kebabCase(item.primaryType ?? "misc");
const directory = join(overridesRoot, category);
const filePath = join(directory, `${slug}.ts`);
if (existsSync(filePath)) {
  throw new Error(`${category}/${slug}.ts already exists`);
}

// clientId is asset identity, not tuning, and the override type omits it.
const { clientId: _clientId, ...fields } = item;
mkdirSync(directory, { recursive: true });
writeFileSync(
  filePath,
  `import type { ItemOverride } from "../ItemOverride";

export const ${exportName}: ItemOverride = ${literal(fields)};
`,
);
registerOverride(category, slug, exportName);
console.log(`scaffolded server/src/item/overrides/${category}/${slug}.ts`);

function findItem(items, query) {
  const byId = items[query];
  if (byId) return byId;
  const wanted = query.toLowerCase();
  const matches = Object.values(items).filter(
    (item) => item.name.toLowerCase() === wanted,
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `"${query}" matches item ids ${matches.map((item) => item.id).join(", ")}` +
        " — pass the id",
    );
  }
  throw new Error(`no catalog item matches "${query}"`);
}

function registerOverride(category, slug, exportName) {
  const source = readFileSync(registryPath, "utf8");
  const importLine =
    `import { ${exportName} } from "./${category}/${slug}";`;
  if (source.includes(importLine)) return;
  const withImport = source.replace(
    'import type { ItemOverride } from "./ItemOverride";',
    `import type { ItemOverride } from "./ItemOverride";\n${importLine}`,
  );
  const entries = withImport.match(
    /export const ITEM_OVERRIDES: ReadonlyArray<ItemOverride> = \[([\s\S]*?)\];/,
  );
  if (!entries) throw new Error("could not find ITEM_OVERRIDES in the registry");
  const existing = entries[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== ",");
  const listed = [...new Set([...existing, `${exportName},`])].sort();
  writeFileSync(
    registryPath,
    withImport.replace(
      entries[0],
      "export const ITEM_OVERRIDES: ReadonlyArray<ItemOverride> = [\n" +
        `${listed.map((entry) => `  ${entry}`).join("\n")}\n];`,
    ),
  );
}

function kebabCase(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function camelCase(slug) {
  return slug
    .split("-")
    .map((part, index) =>
      index === 0 ? part : part[0].toUpperCase() + part.slice(1),
    )
    .join("");
}

/** Prints the item record as a TypeScript object literal. */
function literal(value, depth = 0) {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  const pad = "  ".repeat(depth + 1);
  const closePad = "  ".repeat(depth);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((entry) => literal(entry, depth + 1));
    const inline = `[${items.join(", ")}]`;
    if (inline.length + depth * 2 <= 72) return inline;
    return `[\n${items.map((entry) => `${pad}${entry},`).join("\n")}\n${closePad}]`;
  }
  const rendered = Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .map(([key, entry]) => `${quoteKey(key)}: ${literal(entry, depth + 1)}`);
  if (rendered.length === 0) return "{}";
  const inline = `{ ${rendered.join(", ")} }`;
  if (inline.length + depth * 2 <= 72 && !inline.includes("\n")) return inline;
  return `{\n${rendered.map((entry) => `${pad}${entry},`).join("\n")}\n${closePad}}`;
}

function quoteKey(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}
