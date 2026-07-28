import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// Maps each weapon-proficiency profile to a representative item sprite so the
// client's proficiency window can show the weapon; the lowest item id wins.
const repoRoot = resolve(import.meta.dirname, "..");
const catalog = JSON.parse(
  await readFile(join(repoRoot, "server/data/item-catalog.json"), "utf8"),
);

if (catalog.formatVersion !== 3 || !catalog.items) {
  throw new Error("server item catalog has an unsupported format");
}

const sprites = {};
const chosenItemId = {};
for (const item of Object.values(catalog.items)) {
  if (item.proficiencyId === undefined || !item.spriteId) continue;
  const current = chosenItemId[item.proficiencyId];
  if (current !== undefined && current <= item.id) continue;
  chosenItemId[item.proficiencyId] = item.id;
  sprites[item.proficiencyId] = item.spriteId;
}

const serialized = `${JSON.stringify({ formatVersion: 1, sprites })}\n`;
await writeFile(
  join(repoRoot, "client/public/assets/proficiency-sprites.json"),
  serialized,
);
console.log(
  `built ${Object.keys(sprites).length} proficiency sprite mappings`,
);
