import type { ItemType } from "../item/ItemType";

interface ImbuementSlotState {
  readonly slot: number;
  readonly name?: string;
  readonly remainingSeconds: number;
}

function slotStates(
  attributes: Readonly<Record<string, unknown>>,
): ReadonlyArray<ImbuementSlotState> {
  const raw = attributes.imbuements;
  if (!Array.isArray(raw)) return [];
  const states: ImbuementSlotState[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { slot, remainingSeconds, name } = entry as Record<string, unknown>;
    if (
      typeof slot !== "number" ||
      !Number.isInteger(slot) ||
      typeof remainingSeconds !== "number" ||
      remainingSeconds <= 0
    ) {
      continue;
    }
    states.push({
      slot,
      remainingSeconds,
      ...(typeof name === "string" && name ? { name } : {}),
    });
  }
  return states;
}

/**
 * Canary `Item::parseImbuementDescription`: one line listing every imbuement
 * slot of an existing instance, empty ones included.
 */
export function imbuementLookLine(
  type: ItemType,
  attributes: Readonly<Record<string, unknown>>,
): string | null {
  const slots = type.imbuementSlots ?? 0;
  if (slots < 1) return null;
  const states = slotStates(attributes);
  const entries: string[] = [];
  for (let slot = 0; slot < slots; slot += 1) {
    const state = states.find((candidate) => candidate.slot === slot);
    if (!state) {
      entries.push("Empty Slot");
      continue;
    }
    const minutes = Math.floor(state.remainingSeconds / 60);
    const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
    const remainder = String(minutes % 60).padStart(2, "0");
    entries.push(`${state.name ?? "Imbuement"} ${hours}:${remainder}h`);
  }
  return `Imbuements: (${entries.join(", ")}).`;
}
