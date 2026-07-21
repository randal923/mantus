import type { GameWindowState } from "./GameWindowState";
import type { GameWindowStoreActions } from "./GameWindowStoreActions";

export type GameWindowStoreState = GameWindowState & GameWindowStoreActions;
