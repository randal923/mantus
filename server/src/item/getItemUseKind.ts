import { PORTABLE_SELLER_TYPE_ID, type ItemUseKind } from "@tibia/protocol";
import { getExerciseWeaponDefinition } from "../action/getExerciseWeaponDefinition";
import { getPotionDefinition } from "../potion/getPotionDefinition";
import { ADVENTURERS_STONE_TYPE_ID } from "./adventurersStoneTypeId";
import { getToolDefinition } from "./getToolDefinition";
import { GOLD_CONVERTER_TYPE_IDS } from "./goldConverterTypeIds";
import { TEMPLE_TELEPORT_SCROLL_TYPE_ID } from "./templeTeleportScrollTypeId";
import type { ItemType } from "./ItemType";

/** How the client should offer this item type to be used, if at all. */
export function getItemUseKind(type: ItemType): ItemUseKind | undefined {
  if (type.id === PORTABLE_SELLER_TYPE_ID) return "activate";
  if (type.id === ADVENTURERS_STONE_TYPE_ID) return "activate";
  if (type.id === TEMPLE_TELEPORT_SCROLL_TYPE_ID) return "activate";
  if (GOLD_CONVERTER_TYPE_IDS.has(type.id)) return "useWithItem";
  if (type.kind === "rune") return "rune";
  if (getPotionDefinition(type.id)) return "potion";
  // Exercise weapons are used *on* a dummy, so they raise the same crosshair a
  // tool does rather than trying to equip themselves.
  if (getToolDefinition(type.id) || getExerciseWeaponDefinition(type.id)) {
    return "useWith";
  }
  if (type.containerCapacity !== undefined) return "container";
  if (type.food) return "food";
  if (type.text?.readable) return "read";
  if (type.rotateTo) return "rotate";
  return undefined;
}
