import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * Every item that any pinned creature can drop, deduped and resolved against
 * the item catalog. The loot-filter window searches this so a player can
 * blacklist a drop they have never carried. Loot tables are public knowledge,
 * so shipping the list as a static asset leaks nothing a wiki would not.
 */

const repoRoot = resolve(import.meta.dirname, "..");

const catalog = JSON.parse(
  await readFile(join(repoRoot, "server/data/item-catalog.json"), "utf8"),
);
if (catalog.formatVersion !== 3 || !catalog.items) {
  throw new Error("server item catalog has an unsupported format");
}

const monsters = JSON.parse(
  await readFile(join(repoRoot, "content/monsters/world-monsters.json"), "utf8"),
);
if (monsters.formatVersion !== 3 || !Array.isArray(monsters.types)) {
  throw new Error("world monster content has an unsupported format");
}

const byId = new Map();
for (const item of Object.values(catalog.items)) byId.set(item.id, item);

// Same tie-break as ItemCatalog: the lowest id wins a shared display name, so
// a loot entry naming an item resolves exactly as it does on the server.
const byName = new Map();
for (const item of [...byId.values()].sort((left, right) => left.id - right.id)) {
  const key = item.name.trim().toLowerCase();
  if (!byName.has(key)) byName.set(key, item);
}

const dropped = new Map();
let unresolved = 0;
for (const type of monsters.types) {
  for (const entry of type.loot ?? []) {
    const item =
      (entry.id === undefined ? undefined : byId.get(entry.id)) ??
      (entry.name === undefined
        ? undefined
        : byName.get(entry.name.trim().toLowerCase()));
    if (!item) {
      unresolved += 1;
      continue;
    }
    // Only what a player could actually take: a corpse cannot hand over an
    // item that is not pickupable, so it can never need filtering either.
    if (!item.pickupable || dropped.has(item.id)) continue;
    dropped.set(item.id, {
      id: item.id,
      name: item.name,
      spriteId: item.spriteId,
    });
  }
}

const items = [...dropped.values()].sort(
  (left, right) => left.name.localeCompare(right.name) || left.id - right.id,
);
const serialized = `${JSON.stringify({ formatVersion: 1, items })}\n`;
await writeFile(
  join(repoRoot, "client/public/assets/creature-loot-items.json"),
  serialized,
);
console.log(
  `built ${items.length} creature loot items, ${unresolved} unresolved entries (${createHash(
    "sha256",
  )
    .update(serialized)
    .digest("hex")})`,
);
