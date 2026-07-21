import type { GameClient } from "../../../lib/net/GameClient";
import type { WorldRenderer } from "../../../lib/render/WorldRenderer";
import type { GameWindowStore } from "./GameWindowStore";

export interface GameWindowMessageContext {
  client: GameClient;
  renderer: WorldRenderer;
  store: GameWindowStore;
}
