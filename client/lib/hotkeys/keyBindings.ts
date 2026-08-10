import type { Direction } from "@tibia/protocol";

// Every rebindable action. Movement actions are held-key bindings consumed by
// the movement handler; everything else is a discrete one-shot action
// dispatched through resolveHotkey. A binding is a serialized KeyboardEvent
// combo ("KeyI", "Control+KeyZ" — modifiers in Alt/Control/Meta/Shift order),
// or null while unassigned. Movement bindings are always bare codes.
const MOVEMENT_BINDING_ACTIONS = [
  "moveUp",
  "moveLeft",
  "moveDown",
  "moveRight",
] as const;

const PANEL_BINDING_ACTIONS = [
  "toggleInventory",
  "toggleCharacterStats",
  "toggleQuestLog",
  "toggleBattleList",
  "toggleMinimap",
  "toggleTracker",
  "toggleImbuementTracker",
  "toggleProfile",
  "toggleOutfits",
  "toggleProficiency",
  "togglePartyPanel",
  "toggleGuildModal",
  "toggleHouseModal",
  "toggleVipPanel",
  "toggleHighscores",
  "toggleWiki",
  "toggleWheel",
  "toggleForge",
  "togglePrey",
  "toggleHuntingTasks",
  "toggleHuntFinder",
  "toggleMarket",
  "toggleStore",
] as const;

const INTERFACE_BINDING_ACTIONS = ["toggleGameMenu", "openBugReport"] as const;

export type MovementBindingAction = (typeof MOVEMENT_BINDING_ACTIONS)[number];
export type KeyBindingAction =
  | MovementBindingAction
  | (typeof PANEL_BINDING_ACTIONS)[number]
  | (typeof INTERFACE_BINDING_ACTIONS)[number];
export type HotkeyAction = Exclude<KeyBindingAction, MovementBindingAction>;
export type KeyBindings = Readonly<Record<KeyBindingAction, string | null>>;
export type KeyBindingCategory = "movement" | "panels" | "interface";

export interface KeyBindingSection {
  readonly category: KeyBindingCategory;
  readonly actions: ReadonlyArray<KeyBindingAction>;
}

export const KEY_BINDING_SECTIONS: ReadonlyArray<KeyBindingSection> = [
  { category: "movement", actions: MOVEMENT_BINDING_ACTIONS },
  { category: "panels", actions: PANEL_BINDING_ACTIONS },
  { category: "interface", actions: INTERFACE_BINDING_ACTIONS },
];

export const MOVEMENT_BINDING_DIRECTIONS: Readonly<
  Record<MovementBindingAction, Direction>
> = {
  moveUp: "north",
  moveRight: "east",
  moveDown: "south",
  moveLeft: "west",
};

export function isMovementBindingAction(
  action: KeyBindingAction,
): action is MovementBindingAction {
  return (MOVEMENT_BINDING_ACTIONS as ReadonlyArray<KeyBindingAction>).includes(
    action,
  );
}

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  moveUp: "KeyW",
  moveLeft: "KeyA",
  moveDown: "KeyS",
  moveRight: "KeyD",
  toggleInventory: "KeyI",
  toggleCharacterStats: "KeyC",
  toggleQuestLog: null,
  toggleBattleList: null,
  toggleMinimap: null,
  toggleTracker: null,
  toggleImbuementTracker: null,
  toggleProfile: null,
  toggleOutfits: null,
  toggleProficiency: null,
  togglePartyPanel: "KeyP",
  toggleGuildModal: "KeyG",
  toggleHouseModal: "KeyH",
  toggleVipPanel: "KeyV",
  toggleHighscores: null,
  toggleWiki: null,
  toggleWheel: null,
  toggleForge: null,
  togglePrey: null,
  toggleHuntingTasks: null,
  toggleHuntFinder: null,
  toggleMarket: null,
  toggleStore: null,
  toggleGameMenu: "Escape",
  openBugReport: "Control+KeyZ",
};
