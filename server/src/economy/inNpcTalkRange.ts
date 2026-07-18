import type { Npc } from "../creature/Npc";
import type { Player } from "../Player";

export function inNpcTalkRange(player: Player, npc: Npc): boolean {
  const range = npc.type.dialogue?.talkRange ?? 0;
  return (
    player.position.z === npc.position.z &&
    Math.max(
      Math.abs(player.position.x - npc.position.x),
      Math.abs(player.position.y - npc.position.y),
    ) <= range
  );
}
