// Builds the client look catalog (article/name/description per item type)
// from the pinned server item catalog, for client-side "You see ..." text.
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const catalog = JSON.parse(
  await readFile(join(repoRoot, "server/data/item-catalog.json"), "utf8"),
);

if (catalog.formatVersion !== 2 || !catalog.items) {
  throw new Error("server item catalog has an unsupported format");
}

const items = {};
for (const item of Object.values(catalog.items)) {
  items[item.id] = [
    item.article ?? "",
    item.name,
    ...(item.description ? [item.description] : []),
  ];
}

const output = { formatVersion: 1, items };
await writeFile(
  join(repoRoot, "client/public/assets/look-items.json"),
  `${JSON.stringify(output)}\n`,
);
console.log(`wrote look entries for ${Object.keys(items).length} item types`);
