import type { PointerEvent as ReactPointerEvent } from "react";
import type { MinimapResizeDirection } from "../../lib/minimap/resizeMinimapLayout";

const RESIZE_HANDLES: ReadonlyArray<{
  direction: MinimapResizeDirection;
  className: string;
}> = [
  {
    direction: "north",
    className: "top-0 right-3 left-3 h-2 cursor-n-resize",
  },
  {
    direction: "west",
    className: "top-3 bottom-3 left-0 w-2 cursor-w-resize",
  },
  {
    direction: "northwest",
    className: "top-0 left-0 size-3 cursor-nw-resize",
  },
];

interface MinimapResizeBorderProps {
  label: string;
  onPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    direction: MinimapResizeDirection,
  ) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerEnd: (event: ReactPointerEvent<HTMLElement>) => void;
}

export function MinimapResizeBorder({
  label,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
}: MinimapResizeBorderProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {RESIZE_HANDLES.map(({ direction, className }) => (
        <div
          key={direction}
          title={label}
          className={`pointer-events-auto absolute touch-none ${className}`}
          onPointerDown={(event) => onPointerDown(event, direction)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        />
      ))}
    </div>
  );
}
