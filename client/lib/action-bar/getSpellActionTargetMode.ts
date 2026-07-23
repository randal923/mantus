import type {
  ActionBarTargetMode,
  SpellCatalogEntry,
} from "@tibia/protocol";

export function getSpellActionTargetMode(
  targetKind: SpellCatalogEntry["targetKind"],
  requested: ActionBarTargetMode,
): ActionBarTargetMode {
  if (targetKind === "self") return "self";
  if (targetKind === "direction") return "direction";
  if (targetKind === "position") {
    return requested === "cursor" ? "cursor" : "crosshair";
  }
  if (targetKind === "target-or-direction" && requested === "direction") {
    return "direction";
  }
  return requested === "cursor" ? "cursor" : "attack-target";
}
