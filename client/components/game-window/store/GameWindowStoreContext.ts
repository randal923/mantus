import { createContext } from "react";
import type { GameWindowStore } from "../types/GameWindowStore";

export const GameWindowStoreContext = createContext<GameWindowStore | null>(
  null,
);
