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
      | "loot-item"
      | "open-world-container"
      | "quick-loot"
      | "close-world-container"
      | "use-item"
      | "use-item-with"
      | "split-stack"
      | "rotate-item"
      | "move-item"
      | "move-map-item"
      | "write-item";
  }
>;
