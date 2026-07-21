import { GameHudOverlay } from "./GameHudOverlay";
import { GameNavigation } from "./GameNavigation";
import { GameNotifications } from "./GameNotifications";
import { NpcDialogueOverlay } from "./NpcDialogueOverlay";
import { WorldLoadingOverlay } from "./WorldLoadingOverlay";

export function GameWorldHudParent() {
  return (
    <>
      <WorldLoadingOverlay />
      <GameNavigation />
      <GameNotifications />
      <GameHudOverlay />
      <NpcDialogueOverlay />
    </>
  );
}
