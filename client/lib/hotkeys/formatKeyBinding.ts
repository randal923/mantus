import { formatActionBarHotkey } from "./formatActionBarHotkey";

export function formatKeyBinding(binding: string | null): string {
  return formatActionBarHotkey(binding).replaceAll("Escape", "Esc");
}
