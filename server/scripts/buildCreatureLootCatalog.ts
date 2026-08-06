import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { ItemTooltipData } from "@tibia/protocol";
import { loadItemCatalog } from "../src/item/loadItemCatalog";
import { toItemTooltip } from "../src/item/toItemTooltip";

/**
 * Every item any pinned creature can drop, resolved against the same catalog
 * the server runs on and carrying the same tooltip the server would compose
 * for it. The loot-filter window searches this so a drop can be put on the
 * pick-up list before it is ever seen, and hovers it without a round trip.
 * Loot tables and item stats are public knowledge, so shipping the list as a
 * static asset leaks nothing a wiki would not.
 *
 * Runs under tsx rather than as a plain tools/*.mjs script precisely so the
 * tooltips are the server's, not a second implementation of them.
 */

const MONSTERS_PATH = fileURLToPath(
  new URL("../../content/monsters/world-monsters.json", import.meta.url),
);
const OUTPUT_PATH = fileURLToPath(
  new URL(
    "../../client/public/assets/creature-loot-items.json",
    import.meta.url,
  ),
);

interface CatalogEntry {
  readonly id: number;
  readonly name: string;
  readonly spriteId: number;
  readonly tooltip: ItemTooltipData;
}

const monsters: unknown = JSON.parse(await readFile(MONSTERS_PATH, "utf8"));
if (
  typeof monsters !== "object" ||
  monsters === null ||
  (monsters as { formatVersion?: unknown }).formatVersion !== 3 ||
  !Array.isArray((monsters as { types?: unknown }).types)
) {
  throw new Error("world monster content has an unsupported format");
}
const types = (monsters as { types: ReadonlyArray<Record<string, unknown>> })
  .types;

const catalog = await loadItemCatalog();
const dropped = new Map<number, CatalogEntry>();
let unresolved = 0;
for (const type of types) {
  const loot = Array.isArray(type.loot) ? type.loot : [];
  for (const entry of loot as ReadonlyArray<Record<string, unknown>>) {
    const item =
      (typeof entry.id === "number" ? catalog.get(entry.id) : undefined) ??
      (typeof entry.name === "string"
        ? catalog.findByName(entry.name)
        : undefined);
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
      tooltip: toItemTooltip(item),
    });
  }
}

const items = [...dropped.values()].sort(
  (left, right) => left.name.localeCompare(right.name) || left.id - right.id,
);
const serialized = `${JSON.stringify({ formatVersion: 2, items })}\n`;
await writeFile(OUTPUT_PATH, serialized);
console.log(
  `built ${items.length} creature loot items, ${unresolved} unresolved entries (${createHash(
    "sha256",
  )
    .update(serialized)
    .digest("hex")})`,
);
