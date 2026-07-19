// Discrete one-shot actions triggered by a key press. Held-key movement is a
// separate system in GameWindow and does not go through these bindings.
export type HotkeyAction =
  | "toggleInventory"
  | "toggleCharacterStats"
  | "togglePartyPanel"
  | "toggleGuildModal"
  | "toggleHouseModal"
  | "toggleVipPanel"
  | "toggleGameMenu";

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
