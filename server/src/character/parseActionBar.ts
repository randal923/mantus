import {
  ACTION_BAR_ROW_SLOT_COUNT,
  actionBarSchema,
  createDefaultActionBar,
  type ActionBar,
  type ActionBarItemMode,
} from "@tibia/protocol";

interface LegacyPotionSlot {
  readonly itemTypeId: number;
  readonly targetMode: "self" | "attack-target" | "cursor" | "crosshair";
}

function legacyItemMode(
  targetMode: LegacyPotionSlot["targetMode"],
): ActionBarItemMode {
  switch (targetMode) {
    case "self":
      return "use-on-self";
    case "attack-target":
      return "use-on-target";
    case "cursor":
      return "use-at-cursor";
    case "crosshair":
      return "use-with-crosshair";
  }
}

function legacyPotionSlots(raw: unknown): ReadonlyArray<LegacyPotionSlot | null> {
  const candidate =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as { slots?: unknown }).slots
      : raw;
  if (!Array.isArray(candidate)) return [];
  return candidate.slice(0, ACTION_BAR_ROW_SLOT_COUNT).map((entry) => {
    if (
      entry === null ||
      typeof entry !== "object" ||
      !Number.isInteger((entry as { itemTypeId?: unknown }).itemTypeId)
    ) {
      return null;
    }
    const itemTypeId = (entry as { itemTypeId: number }).itemTypeId;
    const targetMode = (entry as { targetMode?: unknown }).targetMode;
    if (
      itemTypeId < 1 ||
      itemTypeId > 65_535 ||
      (targetMode !== "self" &&
        targetMode !== "attack-target" &&
        targetMode !== "cursor" &&
        targetMode !== "crosshair")
    ) {
      return null;
    }
    return { itemTypeId, targetMode };
  });
}

/** Parses the current shape and upgrades the former spell/potion rows in memory. */
export function parseActionBar(
  raw: unknown,
  legacyPotionRaw?: unknown,
): ActionBar {
  const defaults = createDefaultActionBar();
  const parsed = actionBarSchema.safeParse(raw);
  if (parsed.success) {
    return defaults.map((slot, index) => parsed.data[index] ?? slot);
  }

  if (Array.isArray(raw)) {
    for (
      let index = 0;
      index < Math.min(raw.length, ACTION_BAR_ROW_SLOT_COUNT);
      index += 1
    ) {
      const spellId = raw[index];
      if (typeof spellId !== "string" || spellId.length === 0) continue;
      defaults[index] = {
        ...defaults[index]!,
        action: {
          kind: "spell",
          spellId,
          targetMode: "attack-target",
        },
      };
    }
  }

  for (const [index, potion] of legacyPotionSlots(legacyPotionRaw).entries()) {
    if (!potion) continue;
    const slotIndex = ACTION_BAR_ROW_SLOT_COUNT + index;
    defaults[slotIndex] = {
      ...defaults[slotIndex]!,
      action: {
        kind: "item",
        itemTypeId: potion.itemTypeId,
        mode: legacyItemMode(potion.targetMode),
      },
    };
  }
  return defaults;
}
