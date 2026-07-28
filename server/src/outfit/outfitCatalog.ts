import type { CharacterSex } from "@tibia/protocol";
import { MOUNT_DEFINITIONS, OUTFIT_DEFINITIONS } from "./outfitCatalogData";

/**
 * The pinned outfit and mount catalog, imported from Canary by
 * tools/importCanaryOutfits.mjs. Definitions are static content: a look type
 * or mount id that is not here can never be granted or selected, so the
 * catalog is the outer bound on what any client can ever wear (charter rule 1).
 *
 * A look type also belongs to exactly one sex, and a character's sex is fixed
 * at creation — so the sex check is part of "can this character wear it", not
 * a client-side filter.
 *
 * Mount speed is server-side truth — `MOUNTS.get(id).speed` is what the
 * movement code adds, and the client's displayed speed is decoration
 * (charter rule 8).
 */
export interface OutfitDefinition {
  readonly lookType: number;
  readonly name: string;
  readonly sex: CharacterSex;
  /** Canary's unlocked="yes": granted to every character at creation. */
  readonly starter: boolean;
  /** Canary's premium gate; recorded but not enforced yet (see TODO.md). */
  readonly premium: boolean;
  /** Addon passes the sprite pack has for this look type (0, 1, or 2). */
  readonly addons: number;
}

export interface MountDefinition {
  readonly mountId: number;
  readonly name: string;
  /** The mount's own outfit sprite, drawn under the rider. */
  readonly lookType: number;
  /** Walk-speed points the mount adds while ridden. */
  readonly speed: number;
  readonly premium: boolean;
}

export const OUTFITS: ReadonlyMap<number, OutfitDefinition> = new Map(
  OUTFIT_DEFINITIONS.map((definition) => [definition.lookType, definition]),
);

export const MOUNTS: ReadonlyMap<number, MountDefinition> = new Map(
  MOUNT_DEFINITIONS.map((definition) => [definition.mountId, definition]),
);

/** Look types a character of this sex owns from creation. */
export const STARTER_LOOK_TYPES: Readonly<
  Record<CharacterSex, ReadonlyArray<number>>
> = {
  male: OUTFIT_DEFINITIONS.filter(
    (definition) => definition.starter && definition.sex === "male",
  ).map((definition) => definition.lookType),
  female: OUTFIT_DEFINITIONS.filter(
    (definition) => definition.starter && definition.sex === "female",
  ).map((definition) => definition.lookType),
};
