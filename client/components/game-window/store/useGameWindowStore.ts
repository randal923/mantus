import { useStore } from "zustand";
import type { GameWindowStoreState } from "../types/GameWindowStoreState";
import { useGameWindowStoreApi } from "./useGameWindowStoreApi";

export function useGameWindowStore<T>(
  selector: (state: GameWindowStoreState) => T,
): T {
  return useStore(useGameWindowStoreApi(), selector);
}
