import type { ServerMessage } from "@tibia/protocol";

export type ItemTextState = Extract<ServerMessage, { type: "item-text" }>;
