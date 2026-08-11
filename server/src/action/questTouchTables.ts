import type { Position } from "@tibia/protocol";
import { getMagicEffectId } from "../combat/getMagicEffectId";
import { positionKey } from "../positionKey";

export interface QuestTouchRemoval {
  readonly position: Position;
  readonly itemId: number;
}

export interface QuestTouchDefinition {
  /**
   * The baked scenery client id the touch is registered on, for reference
   * only: the item never exists as a world item (and may be missing from the
   * item catalog entirely), so resolution is purely by position.
   */
  readonly itemId?: number;
  readonly removals: ReadonlyArray<QuestTouchRemoval>;
  readonly message: string;
  readonly effectId: number;
  /** World-shared re-arm delay stamped when a removal actually happened. */
  readonly cooldownSeconds: number;
  /** Tick-driven re-creation delay for each removed item. */
  readonly restoreAfterMs: number;
  /**
   * Cooldown identity when several touch positions share one Canary storage
   * (the same aid stamped on both sides of a wall). Defaults to the touched
   * tile's own position key.
   */
  readonly cooldownKey?: string;
}

/**
 * Position-keyed quest touch actions on baked static scenery, mirroring
 * Canary's aid-stamped quest touches (startup/tables/item.lua). Hardcoded
 * like LEVER_TOGGLE_PAIRS; keys are `positionKey` of the touched tile. The
 * removal targets must be server-owned world items — add them to
 * MUTABLE_POSITIONS in tools/getMapItemSemantics.mjs and reconvert the map.
 *
 * Entries:
 * - Cults of Tibia "torch bearer" (client id 2930, aid 5524): using the
 *   torch removes the decaying wall in the Carlin cultist cemetery for five
 *   minutes (data-otservbr-global/scripts/quests/cults_of_tibia/
 *   actions_torch.lua; cooldown 306 s, restore 300 s). The OTBM stamps the
 *   same aid on a second sconce at (32395,31808,8) inside the corridor, so
 *   players returning from the hideout can open the wall from the south
 *   side too; both share one cooldown, like Canary's single storage.
 */
const CULTS_CARLIN_WALL: QuestTouchDefinition = {
  itemId: 2_930,
  removals: [{ position: { x: 32_396, y: 31_806, z: 8 }, itemId: 1_295 }],
  message:
    "You hear a loud grinding sound not very far from you. something very heavy seems to have moved.",
  effectId: getMagicEffectId("CONST_ME_POFF"),
  cooldownSeconds: 306,
  restoreAfterMs: 300_000,
  cooldownKey: "cults-carlin-wall",
};

export const QUEST_TOUCH_ACTIONS: ReadonlyMap<string, QuestTouchDefinition> =
  new Map([
    [positionKey({ x: 32_400, y: 31_793, z: 8 }), CULTS_CARLIN_WALL],
    [positionKey({ x: 32_395, y: 31_808, z: 8 }), CULTS_CARLIN_WALL],
  ]);
