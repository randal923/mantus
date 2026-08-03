/**
 * Compact remaining time for one tracked imbuement, with the urgency band the
 * official tracker colours by. Thresholds and text come from OTClient's
 * `modules/game_imbuementtracker/imbuementtracker.lua` `setDuration`: seconds
 * and minutes read red, under three hours reads yellow, anything longer is
 * plain hours.
 */
export function imbuementTrackerTimeOf(remainingSeconds: number): {
  readonly text: string;
  readonly tone: "expired" | "urgent" | "soon" | "normal";
} {
  const bounded = Math.max(0, Math.floor(remainingSeconds));
  if (bounded === 0) return { text: "0m", tone: "expired" };
  const hours = Math.floor(bounded / 3_600);
  const minutes = Math.floor((bounded % 3_600) / 60);
  if (bounded < 60) return { text: `${bounded}s`, tone: "urgent" };
  if (bounded < 3_600) return { text: `${minutes}m`, tone: "urgent" };
  if (bounded < 10_800) {
    return { text: `${hours}h${String(minutes).padStart(2, "0")}`, tone: "soon" };
  }
  return { text: `${hours}h`, tone: "normal" };
}
