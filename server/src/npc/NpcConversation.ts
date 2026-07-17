export interface NpcConversation {
  readonly id: string;
  readonly npcId: string;
  readonly playerId: string;
  currentNodeId: string;
  expiresAt: number;
  pendingAction: boolean;
}
