import type { CSSProperties } from "react";

interface GemSheetIconProps {
  style: CSSProperties;
  label?: string;
}

/** One cell of a gem atelier sprite sheet (see lib/wheel/gemSheets). */
export function GemSheetIcon({ style, label }: GemSheetIconProps) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={style}
      className="inline-block shrink-0 bg-no-repeat"
    />
  );
}
