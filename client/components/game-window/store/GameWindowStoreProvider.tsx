"use client";

import { useEffect, useState } from "react";
import { useLanguageStore } from "../../../stores/useLanguageStore";
import type { GameWindowStoreProviderProps } from "../types/GameWindowStoreProviderProps";
import { createGameWindowStore } from "./createGameWindowStore";
import { GameWindowStoreContext } from "./GameWindowStoreContext";

export function GameWindowStoreProvider({
  accessToken,
  onLogout,
  children,
}: GameWindowStoreProviderProps) {
  const language = useLanguageStore((state) => state.language);
  const [store] = useState(() =>
    createGameWindowStore({
      accessToken,
      initialLanguage: language,
      onLogout,
    }),
  );

  useEffect(() => {
    store.getState().setConfig({ accessToken, onLogout });
  }, [accessToken, onLogout, store]);

  return (
    <GameWindowStoreContext.Provider value={store}>
      {children}
    </GameWindowStoreContext.Provider>
  );
}
