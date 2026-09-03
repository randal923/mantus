import type { ItemOverride } from "../ItemOverride";

/**
 * Corpses of loot-bearing monsters that the generated catalog does not treat
 * as containers, so their loot roll used to be discarded on death. Canary's
 * ItemType defaults any container to eight slots; these either carry the
 * DAT container flag with no items.xml size (capacity 0 here) or are not
 * flagged at all (Mechanical Fighter's wooden trash, the poor soul's mortal
 * essence, dead schiach, dead insane siren). A corpse grows to the size of
 * its loot anyway, so eight is only the empty window's size.
 */
export const lootableCorpses: ReadonlyArray<ItemOverride> = [
  { id: 3138, containerCapacity: 8 }, // wooden trash — Mechanical Fighter
  { id: 9582, containerCapacity: 8 }, // remains of a water elemental
  { id: 9583, containerCapacity: 8 }, // remains of a water elemental (stage 2)
  { id: 11317, containerCapacity: 8 }, // blob — Death Blob
  { id: 26125, containerCapacity: 8 }, // stone tile — Misguided Bully/Thief
  { id: 27586, containerCapacity: 8 }, // unknown corpse — Lava Lurker
  { id: 30137, containerCapacity: 8 }, // dead insane siren — Soul-Broken Harbinger
  { id: 30298, containerCapacity: 8 }, // dead schiach
  { id: 31307, containerCapacity: 8 }, // dead gaffir (stage 1)
  { id: 33891, containerCapacity: 8 }, // some mortal essence — Poor Soul
];
