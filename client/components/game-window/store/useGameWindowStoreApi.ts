import { useContext } from "react";
import { GameWindowStoreContext } from "./GameWindowStoreContext";
import type { GameWindowStore } from "../types/GameWindowStore";

export function useGameWindowStoreApi(): GameWindowStore {
  const store = useContext(GameWindowStoreContext);
  if (!store) {
    throw new Error("GameWindowStoreProvider is missing");
  }
  return store;
}
