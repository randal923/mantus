import type { CreatureOutfit } from "@tibia/protocol";
import type { DialogueGraph } from "../npc/DialogueGraph";

export interface NpcType {
  id: string;
  name: string;
  outfit: CreatureOutfit;
  health: number;
  maxHealth: number;
  speed: number;
  walkIntervalMs: number;
  walkRadius: number;
  dialogue?: DialogueGraph;
}
