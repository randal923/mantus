export interface ActionBarEditorRequest {
  readonly slotIndex: number;
  readonly section: "spell" | "item" | "text" | "hotkey" | "bot";
}
