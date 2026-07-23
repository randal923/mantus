import type { MinimapLayout } from "@tibia/protocol";

const MIN_CANVAS_WIDTH = 220;
const MAX_CANVAS_WIDTH = 720;
const MIN_CANVAS_HEIGHT = 180;
const MAX_CANVAS_HEIGHT = 560;

export type MinimapResizeDirection =
  | "north"
  | "west"
  | "northwest";

export function resizeMinimapLayout(
  layout: MinimapLayout,
  direction: MinimapResizeDirection,
  deltaX: number,
  deltaY: number,
): MinimapLayout {
  const fromLeft = direction === "west" || direction.includes("west");
  const fromTop = direction === "north" || direction.includes("north");

  const width = fromLeft
    ? Math.min(
        MAX_CANVAS_WIDTH,
        Math.max(MIN_CANVAS_WIDTH, Math.round(layout.width - deltaX)),
      )
    : layout.width;
  const height = fromTop
    ? Math.min(
        MAX_CANVAS_HEIGHT,
        Math.max(MIN_CANVAS_HEIGHT, Math.round(layout.height - deltaY)),
      )
    : layout.height;

  return {
    x: layout.x,
    y: layout.y,
    width,
    height,
  };
}
