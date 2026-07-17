"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface GameSettingsState {
  diagonalWalking: boolean;
  setDiagonalWalking: (enabled: boolean) => void;
}

export const useGameSettingsStore = create<GameSettingsState>()(
  persist(
    (set) => ({
      diagonalWalking: true,
      setDiagonalWalking: (diagonalWalking) => set({ diagonalWalking }),
    }),
    { name: "mantus-game-settings" },
  ),
);
