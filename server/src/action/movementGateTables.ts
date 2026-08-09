import type { Position } from "@tibia/protocol";
import { getMagicEffectId } from "../combat/getMagicEffectId";
import { positionKey } from "../positionKey";

/**
 * A step-in gate on a fixed tile: players failing the requirement are
 * teleported to `failPosition` (a fixed spot, unlike the pressure-plate
 * snap-back to the previous tile) with an effect and optional message.
 */
export interface MovementGateDefinition {
  readonly requirement:
    | { readonly kind: "level"; readonly minimum: number }
    | { readonly kind: "premium" };
  readonly failPosition: Position;
  readonly message?: string;
  readonly effectId: number;
}

const MAGIC_BLUE = getMagicEffectId("CONST_ME_MAGIC_BLUE");

const gates = new Map<string, MovementGateDefinition>();

/**
 * Rookgaard level bridge (Canary movements/rookgaard/level_bridge.lua, aid
 * 50998 carried by the OTBM on both bridge tiles): players below level 2
 * bounce back to the west bank.
 */
const LEVEL_BRIDGE: MovementGateDefinition = {
  requirement: { kind: "level", minimum: 2 },
  failPosition: { x: 32_092, y: 32_177, z: 6 },
  message: "You need to be at least Level 2 in order to pass.",
  effectId: MAGIC_BLUE,
};
gates.set(positionKey({ x: 32_091, y: 32_175, z: 6 }), LEVEL_BRIDGE);
gates.set(positionKey({ x: 32_092, y: 32_175, z: 6 }), LEVEL_BRIDGE);

/**
 * Rookgaard premium bridge (Canary movements/rookgaard/premium_bridge.lua,
 * aid 50241): free-account players bounce back to the north bank, silently.
 */
const PREMIUM_BRIDGE: MovementGateDefinition = {
  requirement: { kind: "premium" },
  failPosition: { x: 32_066, y: 32_192, z: 7 },
  effectId: MAGIC_BLUE,
};
gates.set(positionKey({ x: 32_063, y: 32_192, z: 7 }), PREMIUM_BRIDGE);
gates.set(positionKey({ x: 32_063, y: 32_193, z: 7 }), PREMIUM_BRIDGE);

/**
 * Step-in gates keyed by `positionKey` of the gate tile, enforced by
 * `PressurePlateRegistry.onStepIn` before any plate handling.
 */
export const MOVEMENT_GATES: ReadonlyMap<string, MovementGateDefinition> =
  gates;
