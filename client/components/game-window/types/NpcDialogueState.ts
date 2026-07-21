import type { ServerMessage } from "@tibia/protocol";

export type NpcDialogueState = Extract<
  ServerMessage,
  { type: "npc-dialogue" }
>;
