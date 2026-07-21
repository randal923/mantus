import {
  ACTION_BAR_SLOT_COUNT,
  type PotionActionBar,
  type PotionActionBarSlot,
} from "@tibia/protocol";
import type { PotionBarItem } from "./getPotionBarItems";

export function getEffectivePotionActionBar(
  configured: PotionActionBar,
  potions: ReadonlyArray<PotionBarItem>,
): ReadonlyArray<PotionActionBarSlot | null> {
  return Array.from({ length: ACTION_BAR_SLOT_COUNT }, (_, index) =>
    configured.length === 0
      ? potions[index]
        ? {
            itemTypeId: potions[index].item.typeId,
            targetMode: "crosshair" as const,
          }
        : null
      : (configured[index] ?? null),
  );
}
