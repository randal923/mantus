import type { ImbuementBlockedReason } from "@tibia/protocol";

/**
 * Why an imbuement cannot be applied right now, in the order Canary checks
 * them (player.cpp:2658-2690 plus Item::canAddImbuement). Advisory only — the
 * window greys the row, and apply re-runs every one of these at execution
 * time. Gold is absent on purpose: the balance is only known inside the store
 * transaction, so affordability fails there instead.
 */
export function imbuementBlockedReasonOf(input: {
  /** The item's allowed power level for this category; 0 means it cannot. */
  readonly allowedLevel: number;
  readonly baseId: number;
  /** False in scroll mode, where no item constrains the choice. */
  readonly constrainedByItem: boolean;
  readonly premiumRequired: boolean;
  readonly premium: boolean;
  readonly duplicate: boolean;
  readonly materialsCovered: boolean;
  readonly blankScrollMissing: boolean;
}): ImbuementBlockedReason | null {
  if (input.constrainedByItem) {
    if (input.allowedLevel < input.baseId) return "wrong-category";
    if (input.duplicate) return "duplicate-imbuement";
  }
  if (input.premiumRequired && !input.premium) return "premium-required";
  if (input.blankScrollMissing) return "no-blank-scroll";
  if (!input.materialsCovered) return "insufficient-materials";
  return null;
}
