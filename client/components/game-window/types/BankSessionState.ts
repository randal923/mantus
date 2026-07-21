import type { BankActionFailedReason } from "@tibia/protocol";

export interface BankSessionState {
  npcId: string;
  npcName: string;
  balance: number;
  pending: boolean;
  error: BankActionFailedReason | null;
}
