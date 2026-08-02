"use client";

import {
  basicModIconStyle,
  gradeBackdropStyle,
  supremeModIconStyle,
} from "../../lib/wheel/gemSheets";
import type { FragmentWorkshopModKind } from "./FragmentWorkshopModOption";
import { GemSheetIcon } from "./GemSheetIcon";

interface FragmentWorkshopModArtworkProps {
  kind: FragmentWorkshopModKind;
  modId: number;
  grade: number;
  dimmed?: boolean;
}

/** The original Tibia grade frame composited with one basic or supreme mod. */
export function FragmentWorkshopModArtwork({
  kind,
  modId,
  grade,
  dimmed = false,
}: FragmentWorkshopModArtworkProps) {
  return (
    <span
      aria-hidden
      className={`relative inline-block size-[50px] shrink-0 ${
        dimmed ? "opacity-35 grayscale" : ""
      }`}
    >
      <GemSheetIcon style={gradeBackdropStyle(grade)} />
      <span
        className={`absolute inset-0 flex items-center justify-center ${
          kind === "supreme" ? "translate-x-[3px] -translate-y-0.5" : ""
        }`}
      >
        <GemSheetIcon
          style={
            kind === "basic"
              ? basicModIconStyle(modId)
              : supremeModIconStyle(modId)
          }
        />
      </span>
    </span>
  );
}
