import type { ServerMessage } from "@tibia/protocol";

export type LootSessionState = Extract<
  ServerMessage,
  { type: "world-container-state" }
>;
