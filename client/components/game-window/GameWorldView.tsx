import { GameWorldHudParent } from "./GameWorldHudParent";
import { GameWorldOverlayParent } from "./GameWorldOverlayParent";

export function GameWorldView() {
  return (
    <>
      <GameWorldHudParent />
      <GameWorldOverlayParent />
    </>
  );
}
