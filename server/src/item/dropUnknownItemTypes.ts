import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";

/**
 * Hides carried rows whose item type the catalog no longer knows.
 *
 * Every id used to come from the pinned Canary catalog, which only ever
 * grows, so an unreadable row was impossible. Server-added types
 * (`CUSTOM_ITEM_TYPES`) broke that: renumber or retire one and any row minted
 * under the old id becomes unresolvable — and `catalog.require` threw from
 * inside the login path, so one stale row took the whole process down for
 * everybody, on every attempt by that character to enter the world.
 *
 * The rows are left in the database untouched (charter rule 2: nothing is
 * destroyed to recover from a config change) and simply do not load, which
 * makes a bad id a warning in the log and one invisible item rather than an
 * outage. A dropped container takes its contents with it, since a child whose
 * parent is missing would sit in the cache unreachable and unmovable.
 */
export function dropUnknownItemTypes(
  items: ReadonlyArray<Item>,
  catalog: ItemCatalog,
  characterId: string,
): ReadonlyArray<Item> {
  const unknown = items.filter((item) => !catalog.get(item.typeId));
  if (unknown.length === 0) return items;

  const dropped = new Set(unknown.map((item) => item.id));
  for (let grew = true; grew; ) {
    grew = false;
    for (const item of items) {
      if (dropped.has(item.id)) continue;
      const parentId =
        item.location.kind === "container" || item.location.kind === "corpse"
          ? item.location.containerId
          : null;
      if (parentId !== null && dropped.has(parentId)) {
        dropped.add(item.id);
        grew = true;
      }
    }
  }

  const typeIds = [...new Set(unknown.map((item) => item.typeId))];
  console.warn(
    `character ${characterId} holds ${dropped.size} item row(s) the catalog ` +
      `cannot resolve (unknown type${typeIds.length === 1 ? "" : "s"} ` +
      `${typeIds.join(", ")}); left in the database and hidden from this session`,
  );
  return items.filter((item) => !dropped.has(item.id));
}
