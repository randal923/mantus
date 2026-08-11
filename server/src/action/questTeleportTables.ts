import type { Position } from "@tibia/protocol";
import { getMagicEffectId } from "../combat/getMagicEffectId";
import { positionKey } from "../positionKey";

/**
 * A step-in portal whose OTBM item carries no destination (0,0,0): Canary
 * drives these from Lua MoveEvents, so the map converter drops them as
 * `missing-destination` and the server supplies the destination here instead.
 * The player is moved to `destination` and the effect plays where they land.
 */
export interface QuestTeleportDefinition {
  readonly destination: Position;
  readonly effectId: number;
}

const TELEPORT = getMagicEffectId("CONST_ME_TELEPORT");

const teleports = new Map<string, QuestTeleportDefinition>();

/**
 * Cults of Tibia, Carlin cemetery hideout exit (Canary
 * movements_movement-cults-of-carlin-teleport.lua): the portal beside the
 * arrival spot returns the player to the crypt under the cemetery, three
 * tiles south of the entry portal.
 */
teleports.set(positionKey({ x: 32_351, y: 31_679, z: 8 }), {
  destination: { x: 32_403, y: 31_813, z: 8 },
  effectId: TELEPORT,
});

/**
 * Step-in teleports keyed by `positionKey` of the portal tile, applied by
 * `PressurePlateRegistry.onStepIn` after movement gates.
 */
export const QUEST_TELEPORTS: ReadonlyMap<string, QuestTeleportDefinition> =
  teleports;
