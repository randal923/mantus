"use client";

import { GameWindowControllers } from "./game-window/controllers/GameWindowControllers";
import { GameWindowStoreProvider } from "./game-window/store/GameWindowStoreProvider";
import type { GameWindowProps } from "./game-window/types/GameWindowProps";

export default function GameWindow({ accessToken, onLogout }: GameWindowProps) {
  return (
    <GameWindowStoreProvider accessToken={accessToken} onLogout={onLogout}>
      <GameWindowControllers />
    </GameWindowStoreProvider>
  );
}
