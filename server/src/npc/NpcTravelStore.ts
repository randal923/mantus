import type { Position } from "@tibia/protocol";
import type { NpcTravelCommitResult } from "./NpcTravelCommitResult";

export interface NpcTravelStore {
  commit(
    characterId: string,
    expectedCharacterVersion: number,
    destination: Position,
    cost: number,
    npcTypeId: string,
    offerId: string,
  ): Promise<NpcTravelCommitResult>;
}
