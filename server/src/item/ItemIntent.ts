import type { ClientMessage } from "@tibia/protocol";

export type ItemIntent = Extract<
  ClientMessage,
  {
    type:
      | "equip-item"
      | "unequip-item"
      | "pickup-item"
      | "drop-item"
      | "open-container"
      | "close-container"
      | "use-item"
      | "use-item-with"
      | "split-stack"
      | "rotate-item"
      | "move-item"
      | "move-map-item"
      | "write-item";
  }
>;
