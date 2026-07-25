import type { CreatureOutfit } from "@tibia/protocol";
import type { DialogueGraph } from "../npc/DialogueGraph";

/** Canary SPEECHBUBBLE_*: the icon a client draws over the NPC's head. */
export type NpcSpeechBubble =
  | "none"
  | "normal"
  | "trade"
  | "banker"
  | "sailor"
  | "hireling";

/** Canary npcConfig.flags.profession. */
export type NpcProfession =
  | "normal"
  | "trader"
  | "banker"
  | "sailor"
  | "king"
  | "queen";

/**
 * An idle line the NPC says on a timer (Canary npcConfig.voices). The server
 * owns the clock and the roll; nothing about it is client-driven.
 */
export interface NpcVoice {
  readonly text: string;
  readonly intervalMs: number;
  /** Percent chance per interval. */
  readonly chance: number;
  readonly yell: boolean;
}

export interface NpcType {
  id: string;
  name: string;
  description: string;
  outfit: CreatureOutfit;
  health: number;
  maxHealth: number;
  speed: number;
  /**
   * Leash behavior around the spawn slot's home position: the NPC wanders
   * within `walkRadius` tiles every `walkIntervalMs`, and only crosses a
   * floor change when `canChangeFloor` is set (Canary flags.floorchange).
   */
  walkIntervalMs: number;
  walkRadius: number;
  canChangeFloor: boolean;
  profession: NpcProfession;
  speechBubble: NpcSpeechBubble;
  /** Idle speech triggers, server-scheduled. */
  voices: ReadonlyArray<NpcVoice>;
  /** Item type id this NPC trades in, when it is not gold. */
  currencyItemTypeId?: number;
  /**
   * Shop catalog served by this NPC, resolved by the content loader from the
   * shop catalogs. The dialogue's shop action still names the catalog it
   * opens, and that link is re-checked against this owner at load.
   */
  shopId?: string;
  /** The dialogue graph, including its typed travel offers. */
  dialogue?: DialogueGraph;
}
