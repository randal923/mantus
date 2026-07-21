import { GameActionBarOverlays } from "./GameActionBarOverlays";
import { GameCommerceOverlays } from "./GameCommerceOverlays";
import { GameCommunityOverlays } from "./GameCommunityOverlays";
import { GameInventoryOverlays } from "./GameInventoryOverlays";
import { GamePartyTradeOverlays } from "./GamePartyTradeOverlays";
import { GameProgressionOverlays } from "./GameProgressionOverlays";
import { GameSettingsOverlay } from "./GameSettingsOverlay";
import { ItemTextOverlay } from "./ItemTextOverlay";
import { ReportPlayerOverlay } from "./ReportPlayerOverlay";

export function GameWorldOverlayParent() {
  return (
    <>
      <GameCommerceOverlays />
      <GameActionBarOverlays />
      <GameCommunityOverlays />
      <GameProgressionOverlays />
      <ReportPlayerOverlay />
      <GamePartyTradeOverlays />
      <GameInventoryOverlays />
      <ItemTextOverlay />
      <GameSettingsOverlay />
    </>
  );
}
