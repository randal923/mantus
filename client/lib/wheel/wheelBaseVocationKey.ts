import {
  WHEEL_BASE_VOCATION,
  type CharacterVocation,
} from "@tibia/protocol";
import type { WheelVocation } from "./wheelGeometry";

const KEY_BY_BASE = {
  Knight: "knight",
  Paladin: "paladin",
  Sorcerer: "sorcerer",
  Druid: "druid",
  Monk: "monk",
} as const;

/** Maps any (possibly promoted) vocation to its wheel art/data key. */
export function wheelBaseVocationKey(
  vocation: CharacterVocation,
): WheelVocation {
  return KEY_BY_BASE[WHEEL_BASE_VOCATION[vocation]];
}
