import type { EquipmentSlot, Position } from "@tibia/protocol";

export type ItemLocation =
  | { readonly kind: "equipment"; readonly characterId: string; readonly slot: EquipmentSlot }
  | { readonly kind: "inventory"; readonly characterId: string; readonly slot: number }
  | { readonly kind: "container"; readonly containerId: string; readonly slot: number }
  | { readonly kind: "world"; readonly position: Position; readonly stackIndex: number }
  | {
      readonly kind: "depot";
      readonly characterId: string;
      readonly depotId: number;
      readonly slot: number;
    }
  | { readonly kind: "inbox"; readonly characterId: string; readonly slot: number }
  | { readonly kind: "house"; readonly position: Position; readonly stackIndex: number }
  | { readonly kind: "trade-reservation"; readonly characterId: string; readonly slot: number }
  | { readonly kind: "market-escrow"; readonly characterId: string; readonly slot: number }
  | { readonly kind: "corpse"; readonly containerId: string; readonly slot: number };
