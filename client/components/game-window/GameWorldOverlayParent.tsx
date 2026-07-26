import { GameActionBarOverlays } from "./GameActionBarOverlays";
import { GameCommerceOverlays } from "./GameCommerceOverlays";
import { GameCommunityOverlays } from "./GameCommunityOverlays";
import { GameForgeOverlays } from "./GameForgeOverlays";
import { GameInventoryOverlays } from "./GameInventoryOverlays";
import { GameMapContextMenu } from "./GameMapContextMenu";
import { GamePartyTradeOverlays } from "./GamePartyTradeOverlays";
import { GamePreyOverlays } from "./GamePreyOverlays";
import { GameProfileOverlays } from "./GameProfileOverlays";
import { GameProgressionOverlays } from "./GameProgressionOverlays";
import { GameSettingsOverlay } from "./GameSettingsOverlay";
import { GameTrackerOverlays } from "./GameTrackerOverlays";
import { ItemTextOverlay } from "./ItemTextOverlay";
import { ReportPlayerOverlay } from "./ReportPlayerOverlay";

export function GameWorldOverlayParent() {
  return (
    <>
      <GameCommerceOverlays />
      <GameActionBarOverlays />
      <GameCommunityOverlays />
      <GameProgressionOverlays />
      <GamePreyOverlays />
      <GameForgeOverlays />
      <GameTrackerOverlays />
      <GameProfileOverlays />
      <ReportPlayerOverlay />
      <GamePartyTradeOverlays />
      <GameInventoryOverlays />
      <ItemTextOverlay />
      <GameSettingsOverlay />
      <GameMapContextMenu />
    </>
  );
}
