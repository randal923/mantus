import type { CSSProperties } from "react";
import {
  GEM_QUALITIES,
  WHEEL_DOMAINS,
  type GemQuality,
  type WheelBaseVocation,
  type WheelDomain,
} from "@tibia/protocol";

const VOCATION_ROW: Readonly<Record<WheelBaseVocation, number>> = {
  Knight: 0,
  Paladin: 1,
  Sorcerer: 2,
  Druid: 3,
  Monk: 4,
};

/** The selected gem's 64px cell in Tibia's large Atelier sprite sheet. */
export function gemLargeIconStyle(
  vocation: WheelBaseVocation,
  domain: WheelDomain,
  quality: GemQuality,
): CSSProperties {
  const x =
    (WHEEL_DOMAINS.indexOf(domain) * GEM_QUALITIES.length +
      GEM_QUALITIES.indexOf(quality)) *
    64;
  const y = VOCATION_ROW[vocation] * 64;

  return {
    backgroundImage:
      "url(/assets/wheel/icons-gematelier-gemvariants64.png)",
    backgroundPosition: `-${x}px -${y}px`,
    width: "64px",
    height: "64px",
    imageRendering: "pixelated",
  };
}
