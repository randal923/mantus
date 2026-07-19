import type { MinimapLayout } from "@tibia/protocol";

const MIN_CANVAS_WIDTH = 220;
const MAX_CANVAS_WIDTH = 720;
const MIN_CANVAS_HEIGHT = 180;
const MAX_CANVAS_HEIGHT = 560;

export type MinimapResizeDirection =
  | "north"
  | "northeast"
  | "east"
  | "southeast"
  | "south"
  | "southwest"
  | "west"
  | "northwest";

export function resizeMinimapLayout(
  layout: MinimapLayout,
  direction: MinimapResizeDirection,
  deltaX: number,
  deltaY: number,
): MinimapLayout {
  const fromLeft = direction === "west" || direction.includes("west");
  const fromRight = direction === "east" || direction.includes("east");
  const fromTop = direction === "north" || direction.includes("north");
  const fromBottom = direction === "south" || direction.includes("south");

  const width = fromLeft
    ? Math.min(
        Math.min(MAX_CANVAS_WIDTH, layout.width + layout.x),
        Math.max(MIN_CANVAS_WIDTH, Math.round(layout.width - deltaX)),
      )
    : fromRight
      ? Math.min(
          MAX_CANVAS_WIDTH,
          Math.max(MIN_CANVAS_WIDTH, Math.round(layout.width + deltaX)),
        )
      : layout.width;
  const height = fromTop
    ? Math.min(
        Math.min(MAX_CANVAS_HEIGHT, layout.height + layout.y),
        Math.max(MIN_CANVAS_HEIGHT, Math.round(layout.height - deltaY)),
      )
    : fromBottom
      ? Math.min(
          MAX_CANVAS_HEIGHT,
          Math.max(MIN_CANVAS_HEIGHT, Math.round(layout.height + deltaY)),
        )
      : layout.height;

  return {
    x: fromLeft ? layout.x + layout.width - width : layout.x,
    y: fromTop ? layout.y + layout.height - height : layout.y,
    width,
    height,
  };
}
