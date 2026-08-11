import type { Position } from "@tibia/protocol";
import { getMagicEffectId } from "../combat/getMagicEffectId";
import { positionKey } from "../positionKey";

/**
 * A step-in portal the map converter could not resolve on its own: either the
 * OTBM item carries no destination (0,0,0) because Canary drives it from a Lua
 * MoveEvent, or it carries an action/unique id, which makes the converter drop
 * it as content-driven even when the destination is real. The player is moved
 * to `destination` and, when the Canary script or item plays one, `effectId`
 * flashes at both ends.
 */
export interface QuestTeleportDefinition {
  readonly destination: Position;
  readonly effectId?: number;
}

const TELEPORT = getMagicEffectId("CONST_ME_TELEPORT");
const PURPLE_ENERGY = getMagicEffectId("CONST_ME_PURPLEENERGY");
const MAGIC_GREEN = getMagicEffectId("CONST_ME_MAGIC_GREEN");

const teleports = new Map<string, QuestTeleportDefinition>();
const add = (source: Position, destination: Position, effectId?: number) => {
  const key = positionKey(source);
  if (teleports.has(key)) {
    throw new Error(`duplicate quest teleport at ${key}`);
  }
  teleports.set(key, { destination, effectId });
};

/**
 * Cults of Tibia, Carlin cemetery hideout exit (Canary
 * movements_movement-cults-of-carlin-teleport.lua): the portal beside the
 * arrival spot returns the player to the crypt under the cemetery, three
 * tiles south of the entry portal.
 */
add({ x: 32_351, y: 31_679, z: 8 }, { x: 32_403, y: 31_813, z: 8 }, TELEPORT);

// ---------------------------------------------------------------------------
// Canary's `startup/tables/teleport.lua` TeleportUnique rows, applied by
// `scripts/movements/others/teleport.lua` for unique ids 38001-40000: the
// table itself carries the destination and effect, and the MoveEvent has no
// condition of any kind, so these are pure data.
// ---------------------------------------------------------------------------

/** Deeper Fibula: both hideout portals lead back to the entrance cave. */
add({ x: 32_208, y: 32_433, z: 10 }, { x: 32_167, y: 32_438, z: 9 }, TELEPORT);
add({ x: 32_234, y: 32_502, z: 10 }, { x: 32_167, y: 32_438, z: 9 }, TELEPORT);

/** Draconia: the two-way pair on the plateau and the cave shortcut below. */
add({ x: 32_794, y: 31_576, z: 5 }, { x: 32_812, y: 31_577, z: 5 }, TELEPORT);
add({ x: 32_812, y: 31_576, z: 5 }, { x: 32_794, y: 31_577, z: 5 }, TELEPORT);
add({ x: 32_669, y: 31_653, z: 10 }, { x: 32_679, y: 31_673, z: 10 }, TELEPORT);

/** Demon Helmet quest, Edron mountain: in, back out, and the deep descent. */
add({ x: 33_278, y: 31_592, z: 11 }, { x: 33_281, y: 31_592, z: 12 }, TELEPORT);
add({ x: 33_286, y: 31_589, z: 12 }, { x: 33_277, y: 31_592, z: 11 }, TELEPORT);
add({ x: 33_324, y: 31_592, z: 14 }, { x: 33_324, y: 31_575, z: 15 }, TELEPORT);

/** Alawar's Vault: entrance north of Carlin and the vault's own way out. */
add({ x: 32_187, y: 31_622, z: 8 }, { x: 32_107, y: 31_567, z: 9 }, TELEPORT);
add({ x: 32_107, y: 31_566, z: 9 }, { x: 32_189, y: 31_625, z: 4 }, TELEPORT);

/** The Paradox Tower: one portal per floor, climbing the tower. */
add({ x: 32_481, y: 31_905, z: 1 }, { x: 32_480, y: 31_905, z: 2 }, TELEPORT);
add({ x: 32_479, y: 31_904, z: 2 }, { x: 32_479, y: 31_904, z: 3 }, TELEPORT);
add({ x: 32_476, y: 31_904, z: 3 }, { x: 32_476, y: 31_904, z: 4 }, TELEPORT);
add({ x: 32_481, y: 31_904, z: 4 }, { x: 32_481, y: 31_905, z: 5 }, TELEPORT);
add({ x: 32_476, y: 31_904, z: 5 }, { x: 32_476, y: 31_904, z: 6 }, TELEPORT);

/**
 * Water elemental cave under Trapwood. The five sibling vortices sit on water
 * tiles nobody can step on without swimming, so only the dry one is listed.
 */
add({ x: 32_649, y: 32_985, z: 8 }, { x: 32_653, y: 32_987, z: 9 }, TELEPORT);

/** Faceless Bane: both room exits drop back at the lever room entrance. */
add({ x: 33_640, y: 32_559, z: 13 }, { x: 33_618, y: 32_523, z: 15 }, TELEPORT);
add({ x: 33_617, y: 32_569, z: 13 }, { x: 33_618, y: 32_523, z: 15 }, TELEPORT);

/**
 * Grave Danger, the knights' maze under Drefia: sixteen vortices shuffle the
 * player between chambers and four spit them back out at the Carlin cemetery
 * entrance (32172,31917,8).
 */
add({ x: 33_421, y: 31_521, z: 13 }, { x: 32_172, y: 31_917, z: 8 }, TELEPORT);
add({ x: 33_465, y: 31_521, z: 13 }, { x: 32_172, y: 31_917, z: 8 }, TELEPORT);
add({ x: 33_432, y: 31_529, z: 13 }, { x: 33_437, y: 31_530, z: 13 }, TELEPORT);
add({ x: 33_435, y: 31_529, z: 13 }, { x: 33_430, y: 31_531, z: 13 }, TELEPORT);
add({ x: 33_451, y: 31_529, z: 13 }, { x: 33_456, y: 31_531, z: 13 }, TELEPORT);
add({ x: 33_454, y: 31_529, z: 13 }, { x: 33_449, y: 31_530, z: 13 }, TELEPORT);
add({ x: 33_423, y: 31_538, z: 13 }, { x: 33_424, y: 31_543, z: 13 }, TELEPORT);
add({ x: 33_463, y: 31_538, z: 13 }, { x: 33_462, y: 31_543, z: 13 }, TELEPORT);
add({ x: 33_443, y: 31_539, z: 13 }, { x: 32_172, y: 31_917, z: 8 }, TELEPORT);
add({ x: 33_423, y: 31_541, z: 13 }, { x: 33_425, y: 31_536, z: 13 }, TELEPORT);
add({ x: 33_463, y: 31_541, z: 13 }, { x: 33_465, y: 31_536, z: 13 }, TELEPORT);
add({ x: 33_423, y: 31_551, z: 13 }, { x: 33_425, y: 31_556, z: 13 }, TELEPORT);
add({ x: 33_463, y: 31_553, z: 13 }, { x: 33_462, y: 31_548, z: 13 }, TELEPORT);
add({ x: 33_423, y: 31_554, z: 13 }, { x: 33_424, y: 31_549, z: 13 }, TELEPORT);
add({ x: 33_432, y: 31_562, z: 13 }, { x: 33_437, y: 31_563, z: 13 }, TELEPORT);
add({ x: 33_435, y: 31_562, z: 13 }, { x: 33_430, y: 31_564, z: 13 }, TELEPORT);
add({ x: 33_451, y: 31_562, z: 13 }, { x: 33_456, y: 31_564, z: 13 }, TELEPORT);
add({ x: 33_454, y: 31_562, z: 13 }, { x: 33_449, y: 31_561, z: 13 }, TELEPORT);
add({ x: 33_421, y: 31_570, z: 13 }, { x: 32_172, y: 31_917, z: 8 }, TELEPORT);
add({ x: 33_465, y: 31_570, z: 13 }, { x: 32_172, y: 31_917, z: 8 }, TELEPORT);

// ---------------------------------------------------------------------------
// Lua MoveEvents whose step-in handler teleports unconditionally. Each keeps
// its Canary effect; anything the script does beyond the teleport (quest
// storages, spawning scenery) is not modelled here.
// ---------------------------------------------------------------------------

/** Vengoth castle (movements/teleport/vengoth_teleport.lua, aid 50220-50229). */
add({ x: 32_937, y: 31_573, z: 0 }, { x: 32_940, y: 31_558, z: 1 }, PURPLE_ENERGY);
add({ x: 32_941, y: 31_578, z: 0 }, { x: 32_950, y: 31_575, z: 1 }, PURPLE_ENERGY);
add({ x: 32_962, y: 31_551, z: 1 }, { x: 32_959, y: 31_540, z: 4 }, PURPLE_ENERGY);
add({ x: 32_944, y: 31_553, z: 1 }, { x: 32_951, y: 31_552, z: 3 }, PURPLE_ENERGY);
add({ x: 32_939, y: 31_558, z: 1 }, { x: 32_938, y: 31_573, z: 0 }, PURPLE_ENERGY);
add({ x: 32_960, y: 31_560, z: 1 }, { x: 32_951, y: 31_568, z: 1 }, PURPLE_ENERGY);
add({ x: 32_952, y: 31_567, z: 1 }, { x: 32_961, y: 31_559, z: 1 }, PURPLE_ENERGY);
add({ x: 32_951, y: 31_575, z: 1 }, { x: 32_940, y: 31_577, z: 0 }, PURPLE_ENERGY);
add({ x: 32_950, y: 31_552, z: 3 }, { x: 32_943, y: 31_553, z: 1 }, PURPLE_ENERGY);
add({ x: 32_960, y: 31_541, z: 4 }, { x: 32_961, y: 31_552, z: 1 }, PURPLE_ENERGY);

/**
 * Dreamer's Challenge courts (movement_court_teleport.lua, aid 3200-3203):
 * Feyrist's summer and winter courts, in and back out. Canary plays no effect.
 */
add({ x: 32_354, y: 31_247, z: 3 }, { x: 33_675, y: 32_148, z: 7 });
add({ x: 33_675, y: 32_147, z: 7 }, { x: 32_354, y: 31_248, z: 3 });
add({ x: 33_584, y: 32_207, z: 7 }, { x: 33_672, y: 32_228, z: 7 });
add({ x: 33_672, y: 32_227, z: 7 }, { x: 33_584, y: 32_208, z: 7 });

/**
 * Dreamer's Challenge death ring exit (movement_death_ring_teleport.lua, uid
 * 9234). Canary also regrows the three trees behind the player; we only move
 * them out.
 */
add({ x: 32_857, y: 32_230, z: 11 }, { x: 32_819, y: 32_347, z: 9 }, TELEPORT);

/**
 * White Pearl, Liberty Bay (movements_white_pearl.lua, aid 5630/5631). The
 * first portal shifts one tile east in Canary while the pot at
 * (33145,32862,7) is still there; we always use the default landing spot.
 */
add({ x: 33_148, y: 32_864, z: 7 }, { x: 33_145, y: 32_863, z: 7 }, MAGIC_GREEN);
add({ x: 33_150, y: 32_864, z: 7 }, { x: 33_147, y: 32_864, z: 7 }, MAGIC_GREEN);

/** Deathling sanctum entrances (actions/object/deathlings_entrance.lua). */
add({ x: 33_584, y: 31_388, z: 13 }, { x: 33_584, y: 31_390, z: 13 }, TELEPORT);
add({ x: 33_560, y: 31_395, z: 13 }, { x: 33_563, y: 31_389, z: 13 }, TELEPORT);

/**
 * The waterfall cave north-east of Port Hope (movements_waterfall.lua, aid
 * 50022): walking into the falls enters the cave, and the tile behind them
 * leads back out. Canary plays no effect on either.
 */
add({ x: 32_968, y: 32_629, z: 7 }, { x: 32_968, y: 32_631, z: 8 });
add({ x: 32_967, y: 32_630, z: 8 }, { x: 32_971, y: 32_620, z: 8 });

/** The Secret Library: the two-way portal pair (movement_teleport.lua). */
add({ x: 32_672, y: 32_736, z: 11 }, { x: 32_480, y: 32_597, z: 15 }, TELEPORT);
add({ x: 32_480, y: 32_601, z: 15 }, { x: 32_674, y: 32_738, z: 11 }, TELEPORT);

/** Cults of Tibia: the way out of the Essence of Malice chamber. */
add({ x: 33_085, y: 31_963, z: 15 }, { x: 32_349, y: 31_668, z: 10 }, TELEPORT);

/**
 * The Queen of the Banshees, last seal flame (uid 35019): steps straight into
 * the final battle room. Canary also resets the seven seal-door storages and
 * arms the final battle; we only move the player.
 */
add({ x: 32_219, y: 31_913, z: 15 }, { x: 32_269, y: 31_853, z: 15 }, TELEPORT);

// ---------------------------------------------------------------------------
// Portals whose OTBM destination is real, dropped by the converter only
// because the item carries an action/unique id. No Canary MoveEvent claims
// these ids, so the C++ `Teleport` item is the whole behaviour: it moves the
// stepper to the map destination and plays the item's own teleport effect.
// ---------------------------------------------------------------------------

/** Deeper Banuta shortcut pairs: earth, fire and ice portals. */
add({ x: 32_886, y: 32_772, z: 9 }, { x: 32_860, y: 32_798, z: 11 }, TELEPORT);
add({ x: 32_860, y: 32_798, z: 11 }, { x: 32_887, y: 32_772, z: 9 }, TELEPORT);

/**
 * Deeper Banuta's death portals, nudged one tile. The OTBM aims each of the
 * pair at the tile *north* of the other portal — (32857,32738,11) and
 * (32818,32779,11) — and both of those are solid mountain wall (ground 1128
 * plus wall 23828, no floor). Canary's C++ `Teleport` force-moves the player
 * into the rock anyway; we land them on the open floor beside the paired
 * portal instead, which is the spot the map clearly meant.
 */
add({ x: 32_818, y: 32_780, z: 11 }, { x: 32_856, y: 32_739, z: 11 }, TELEPORT);
add({ x: 32_857, y: 32_739, z: 11 }, { x: 32_817, y: 32_780, z: 11 }, TELEPORT);
add({ x: 32_854, y: 32_737, z: 10 }, { x: 32_860, y: 32_769, z: 11 }, TELEPORT);
add({ x: 32_860, y: 32_769, z: 11 }, { x: 32_854, y: 32_738, z: 10 }, TELEPORT);
add({ x: 32_858, y: 32_766, z: 10 }, { x: 32_882, y: 32_790, z: 11 }, TELEPORT);
add({ x: 32_882, y: 32_790, z: 11 }, { x: 32_858, y: 32_767, z: 10 }, TELEPORT);

/** Ape City catacombs shortcut down to the deeper level. */
add({ x: 32_883, y: 32_633, z: 11 }, { x: 32_839, y: 32_531, z: 9 }, TELEPORT);

/** The Secret Library, Liquid Death wing: the way back to the library. */
add({ x: 33_365, y: 32_147, z: 10 }, { x: 33_248, y: 32_119, z: 8 }, TELEPORT);

/** Cults of Tibia: the Sandking cave exit at the Kilmaresh coast. */
add({ x: 33_449, y: 32_241, z: 7 }, { x: 33_072, y: 31_867, z: 15 }, TELEPORT);

/** Ferumbras' Ascension: the habitat corridor portal. */
add({ x: 33_608, y: 32_627, z: 13 }, { x: 33_593, y: 32_658, z: 14 }, TELEPORT);

/** Formorgar mines: the lift portal back up to the glacier. */
add({ x: 32_367, y: 31_374, z: 11 }, { x: 32_365, y: 31_368, z: 6 }, TELEPORT);

/**
 * Step-in teleports keyed by `positionKey` of the portal tile, applied by
 * `PressurePlateRegistry.onStepIn` after movement gates.
 */
export const QUEST_TELEPORTS: ReadonlyMap<string, QuestTeleportDefinition> =
  teleports;
