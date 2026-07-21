import type { CSSProperties } from "react";
import {
  GEM_QUALITIES,
  WHEEL_DOMAINS,
  type GemQuality,
  type WheelBaseVocation,
  type WheelDomain,
} from "@tibia/protocol";

/**
 * CSS clips into the otclient-mehah gem atelier sprite sheets under
 * /assets/wheel (see tools/importWheelGemAssets.mjs). Sheet indexing:
 * gems 32px by (vocation, domain, quality), basic mods 30px by id,
 * supreme mods 35px by id, domain affinity 26px, grade backdrops 50px.
 */
const VOCATION_SHEET_INDEX: Readonly<Record<WheelBaseVocation, number>> = {
  Knight: 1,
  Paladin: 2,
  Sorcerer: 3,
  Druid: 4,
  Monk: 5,
};

const clip = (
  sheet: string,
  x: number,
  width: number,
  height: number,
): CSSProperties => ({
  backgroundImage: `url(/assets/wheel/${sheet})`,
  backgroundPosition: `-${x}px 0`,
  width: `${width}px`,
  height: `${height}px`,
  imageRendering: "pixelated",
});

export function gemIconStyle(
  vocation: WheelBaseVocation,
  domain: WheelDomain,
  quality: GemQuality,
): CSSProperties {
  const x =
    (VOCATION_SHEET_INDEX[vocation] - 1) * 384 +
    WHEEL_DOMAINS.indexOf(domain) * 96 +
    GEM_QUALITIES.indexOf(quality) * 32;
  return clip("icons-gematelier-gemvariants.png", x, 32, 32);
}

export function basicModIconStyle(modId: number): CSSProperties {
  return clip("icons-skillwheel-basicmods.png", modId * 30, 30, 30);
}

export function supremeModIconStyle(modId: number): CSSProperties {
  return clip("icons-skillwheel-suprememods.png", modId * 35, 35, 35);
}

export function domainIconStyle(domain: WheelDomain): CSSProperties {
  return clip(
    "icons-gematelier-domainaffinity.png",
    WHEEL_DOMAINS.indexOf(domain) * 26,
    26,
    26,
  );
}

export function gradeBackdropStyle(grade: number): CSSProperties {
  return clip("backdrop_modgrades.png", grade * 50, 50, 50);
}

export function fragmentIconStyle(kind: "lesser" | "greater"): CSSProperties {
  return {
    backgroundImage: "url(/assets/wheel/fragmentIcon.png)",
    backgroundPosition: `0 -${kind === "lesser" ? 0 : 12}px`,
    width: "12px",
    height: "12px",
    imageRendering: "pixelated",
  };
}
