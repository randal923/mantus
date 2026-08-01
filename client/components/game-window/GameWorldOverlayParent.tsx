import { GameActionBarOverlays } from "./GameActionBarOverlays";
import { GameCommerceOverlays } from "./GameCommerceOverlays";
import { GameCommunityOverlays } from "./GameCommunityOverlays";
import { GameForgeOverlays } from "./GameForgeOverlays";
import { GameHuntFinderOverlay } from "./GameHuntFinderOverlay";
import { GameInventoryOverlays } from "./GameInventoryOverlays";
import { GameLootFilterOverlay } from "./GameLootFilterOverlay";
import { GameMapContextMenu } from "./GameMapContextMenu";
import { GamePartyTradeOverlays } from "./GamePartyTradeOverlays";
import { GamePreyOverlays } from "./GamePreyOverlays";
import { GameProficiencyOverlays } from "./GameProficiencyOverlays";
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
      <GameLootFilterOverlay />
      <GameCommunityOverlays />
      <GameProgressionOverlays />
      <GamePreyOverlays />
      <GameHuntFinderOverlay />
      <GameForgeOverlays />
      <GameProficiencyOverlays />
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
