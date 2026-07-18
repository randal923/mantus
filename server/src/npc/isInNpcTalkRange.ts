import type { Npc } from "../creature/Npc";
import type { Player } from "../Player";
import type { DialogueGraph } from "./DialogueGraph";

export function isInNpcTalkRange(
  player: Player,
  npc: Npc,
  graph: DialogueGraph,
): boolean {
  return (
    player.position.z === npc.position.z &&
    Math.max(
      Math.abs(player.position.x - npc.position.x),
      Math.abs(player.position.y - npc.position.y),
    ) <= graph.talkRange
  );
}
