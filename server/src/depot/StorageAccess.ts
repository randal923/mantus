import type { Position } from "@tibia/protocol";

export type StorageAccess =
  | {
      readonly kind: "depot";
      readonly sessionId: string;
      readonly position: Position;
      readonly depotId: number;
      readonly townName: string;
    }
  | {
      readonly kind: "mailbox";
      readonly sessionId: string;
      readonly position: Position;
    };
