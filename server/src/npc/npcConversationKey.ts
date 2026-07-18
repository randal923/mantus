export function npcConversationKey(npcId: string, playerId: string): string {
  return `${npcId}\u0000${playerId}`;
}
