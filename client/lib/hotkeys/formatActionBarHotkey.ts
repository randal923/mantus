export function formatActionBarHotkey(hotkey: string | null): string {
  if (!hotkey) return "";
  return hotkey
    .replaceAll("Control", "Ctrl")
    .replaceAll("Digit", "")
    .replaceAll("Numpad", "Num ")
    .replaceAll("Key", "")
    .replaceAll("Arrow", "");
}
