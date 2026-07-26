// Discrete one-shot actions triggered by a key press. Held-key movement is a
// separate system in GameWindow and does not go through these bindings.
export type HotkeyAction =
  | "toggleInventory"
  | "toggleCharacterStats"
  | "togglePartyPanel"
  | "toggleGuildModal"
  | "toggleHouseModal"
  | "toggleVipPanel"
  | "toggleGameMenu"
  | "openBugReport";

/** Keyed by KeyboardEvent.code so bindings are keyboard-layout independent. */
export const HOTKEY_BINDINGS: Readonly<Record<string, HotkeyAction>> = {
  KeyI: "toggleInventory",
  KeyC: "toggleCharacterStats",
  KeyP: "togglePartyPanel",
  KeyG: "toggleGuildModal",
  KeyH: "toggleHouseModal",
  KeyV: "toggleVipPanel",
  Escape: "toggleGameMenu",
};

/** Ctrl-only combos (no Alt/Meta/Shift); other combos stay with the browser. */
export const CTRL_HOTKEY_BINDINGS: Readonly<Record<string, HotkeyAction>> = {
  KeyZ: "openBugReport",
};
