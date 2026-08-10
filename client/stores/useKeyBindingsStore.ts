"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_KEY_BINDINGS,
  type KeyBindingAction,
  type KeyBindings,
} from "../lib/hotkeys/keyBindings";

interface KeyBindingsState {
  bindings: KeyBindings;
  setBinding: (action: KeyBindingAction, binding: string | null) => void;
  resetBindings: () => void;
}

export const useKeyBindingsStore = create<KeyBindingsState>()(
  persist(
    (set) => ({
      bindings: DEFAULT_KEY_BINDINGS,
      setBinding: (action, binding) =>
        set((state) => {
          const next: Record<KeyBindingAction, string | null> = {
            ...state.bindings,
          };
          if (binding) {
            // A key drives exactly one action; steal it from any other owner.
            for (const other of Object.keys(next) as KeyBindingAction[]) {
              if (next[other] === binding) next[other] = null;
            }
          }
          next[action] = binding;
          return { bindings: next };
        }),
      resetBindings: () => set({ bindings: DEFAULT_KEY_BINDINGS }),
    }),
    {
      name: "mantus-key-bindings",
      // Stored snapshots may predate newly added actions; defaults fill gaps.
      merge: (persisted, current) => {
        const stored = (persisted as { bindings?: Partial<KeyBindings> } | null)
          ?.bindings;
        return {
          ...current,
          bindings: { ...DEFAULT_KEY_BINDINGS, ...stored },
        };
      },
    },
  ),
);
