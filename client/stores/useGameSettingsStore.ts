"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface GameSettingsState {
  diagonalWalking: boolean;
  setDiagonalWalking: (enabled: boolean) => void;
  /** Comfort floor for the world lightmap, as a 0-100% slider value. */
  minimumAmbientLight: number;
  setMinimumAmbientLight: (percent: number) => void;
}

export const useGameSettingsStore = create<GameSettingsState>()(
  persist(
    (set) => ({
      diagonalWalking: true,
      setDiagonalWalking: (diagonalWalking) => set({ diagonalWalking }),
      minimumAmbientLight: 25,
      setMinimumAmbientLight: (minimumAmbientLight) =>
        set({ minimumAmbientLight }),
    }),
    { name: "mantus-game-settings" },
  ),
);
