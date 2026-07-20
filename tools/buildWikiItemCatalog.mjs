import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const catalog = JSON.parse(
  await readFile(join(repoRoot, "server/data/item-catalog.json"), "utf8"),
);

if (catalog.formatVersion !== 2 || !catalog.items) {
  throw new Error("server item catalog has an unsupported format");
}

const wikiItems = Object.values(catalog.items)
  .filter((item) => item.pickupable)
  .map((item) => ({
    id: item.id,
    name: item.name,
    spriteId: item.spriteId,
    weight: item.weight,
    ...(item.description ? { description: item.description } : {}),
    ...(item.primaryType ? { primaryType: item.primaryType } : {}),
    ...(item.equipmentSlot ? { equipmentSlot: item.equipmentSlot } : {}),
    ...(item.weaponType ? { weaponType: item.weaponType } : {}),
    ...(item.attack !== undefined ? { attack: item.attack } : {}),
    ...(item.defense !== undefined ? { defense: item.defense } : {}),
    ...(item.extraDefense !== undefined
      ? { extraDefense: item.extraDefense }
      : {}),
    ...(item.armor !== undefined ? { armor: item.armor } : {}),
    ...(item.range !== undefined ? { range: item.range } : {}),
    ...(item.hitChance !== undefined ? { hitChance: item.hitChance } : {}),
    ...(item.manaCost !== undefined ? { manaCost: item.manaCost } : {}),
    ...(item.minimumDamage !== undefined
      ? { minimumDamage: item.minimumDamage }
      : {}),
    ...(item.maximumDamage !== undefined
      ? { maximumDamage: item.maximumDamage }
      : {}),
    ...(item.wandType ? { wandType: item.wandType } : {}),
    ...(item.imbuementSlots !== undefined
      ? { imbuementSlots: item.imbuementSlots }
      : {}),
    ...(item.containerCapacity !== undefined
      ? { containerCapacity: item.containerCapacity }
      : {}),
    ...(item.charges !== undefined ? { charges: item.charges } : {}),
    ...(item.speed !== undefined ? { speed: item.speed } : {}),
    ...(item.requirements ? { requirements: item.requirements } : {}),
  }))
  .sort(
    (left, right) =>
      left.name.localeCompare(right.name) || left.id - right.id,
  );
const serialized = `${JSON.stringify({ formatVersion: 1, items: wikiItems })}\n`;
await writeFile(
  join(repoRoot, "client/public/assets/wiki-items.json"),
  serialized,
);
console.log(
  `built ${wikiItems.length} wiki items (${createHash("sha256")
    .update(serialized)
    .digest("hex")})`,
);
