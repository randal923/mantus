/** Wall-clock stamp shown next to chat lines; display-only, never sent. */
export function formatChatTime(date = new Date()): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
