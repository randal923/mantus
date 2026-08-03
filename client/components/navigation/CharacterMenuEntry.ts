/** Panels the character menu opens; the id also picks the row's icon. */
export type CharacterMenuEntryId =
  | "tracker"
  | "imbuementTracker"
  | "battleList"
  | "profile"
  | "outfit"
  | "proficiency"
  | "guild"
  | "quests"
  | "party"
  | "vip";

export interface CharacterMenuEntry {
  readonly id: CharacterMenuEntryId;
  readonly label: string;
  readonly hotkey?: string;
  /** The panel is open; the row reads as checked. */
  readonly active: boolean;
  readonly onSelect?: () => void;
}
