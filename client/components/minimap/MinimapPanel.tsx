"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { CreatureState, MinimapLayout, Position } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { MinimapRegionStore } from "../../lib/minimap/MinimapRegionStore";
import { drawMinimap, type MinimapMarker } from "../../lib/minimap/drawMinimap";
import {
  loadNpcShopCategories,
  type NpcShopCategories,
} from "../../lib/minimap/loadNpcShopCategories";
import {
  resizeMinimapLayout,
  type MinimapResizeDirection,
} from "../../lib/minimap/resizeMinimapLayout";
import { MinimapControlButton } from "./MinimapControlButton";
import { MinimapResizeBorder } from "./MinimapResizeBorder";

const DEFAULT_CANVAS_WIDTH = 360;
const DEFAULT_CANVAS_HEIGHT = 264;
/** Chrome around the canvas: section padding + canvas and panel borders. */
const PANEL_CHROME = 28;
const MAX_TOOLTIP_CATEGORIES = 4;
const ZOOM_LEVELS = [1, 2, 3, 4, 6, 8] as const;
const DEFAULT_ZOOM_INDEX = 2;
const GROUND_FLOOR = 7;
const MIN_FLOOR = 0;
const MAX_FLOOR = 15;
const HOVER_RADIUS = 8;

interface MinimapHover {
  x: number;
  y: number;
  creature: CreatureState;
}

interface MinimapDrag {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  centerX: number;
  centerY: number;
  moved: boolean;
}

interface PanelDrag {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  baseLayout: MinimapLayout;
  resizeDirection: MinimapResizeDirection | null;
}

interface MinimapPanelProps {
  mapName: string;
  ownPlayerId: string;
  ownPosition: Position;
  creatures: ReadonlyArray<CreatureState>;
  layout: MinimapLayout | null;
  onLayoutChange: (layout: MinimapLayout) => void;
}

export function MinimapPanel({
  mapName,
  ownPlayerId,
  ownPosition,
  creatures,
  layout,
  onLayoutChange,
}: MinimapPanelProps) {
  const { t } = useAppTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const markersRef = useRef<MinimapMarker[]>([]);
  const dragRef = useRef<MinimapDrag | null>(null);
  const panelDragRef = useRef<PanelDrag | null>(null);
  const [store, setStore] = useState<MinimapRegionStore | null>(null);
  const [regionVersion, setRegionVersion] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [viewFloor, setViewFloor] = useState<number | null>(null);
  const [panCenter, setPanCenter] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [hover, setHover] = useState<MinimapHover | null>(null);
  const [shopCategories, setShopCategories] = useState<NpcShopCategories>({});

  const floor = viewFloor ?? ownPosition.z;
  const center = panCenter ?? { x: ownPosition.x, y: ownPosition.y };
  const pixelsPerTile = ZOOM_LEVELS[zoomIndex] ?? 3;
  const detached = panCenter !== null || viewFloor !== null;
  const canvasWidth = layout?.width ?? DEFAULT_CANVAS_WIDTH;
  const canvasHeight = layout?.height ?? DEFAULT_CANVAS_HEIGHT;

  useEffect(() => {
    const next = new MinimapRegionStore(mapName, () =>
      setRegionVersion((version) => version + 1),
    );
    void next.load();
    setStore(next);
    return () => next.dispose();
  }, [mapName]);

  useEffect(() => {
    let cancelled = false;
    void loadNpcShopCategories().then((categories) => {
      if (!cancelled) setShopCategories(categories);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !store) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    markersRef.current = drawMinimap({
      canvas,
      store,
      center,
      floor,
      pixelsPerTile,
      creatures,
      ownPlayerId,
      ownPosition,
    });
  }, [
    store,
    regionVersion,
    center.x,
    center.y,
    floor,
    pixelsPerTile,
    creatures,
    ownPlayerId,
    ownPosition,
    canvasWidth,
    canvasHeight,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoomIndex((index) =>
        Math.min(
          ZOOM_LEVELS.length - 1,
          Math.max(0, index + (event.deltaY < 0 ? 1 : -1)),
        ),
      );
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      centerX: center.x,
      centerY: center.y,
      moved: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      const dx = event.clientX - drag.startClientX;
      const dy = event.clientY - drag.startClientY;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      drag.moved = true;
      setHover(null);
      setPanCenter({
        x: drag.centerX - dx / pixelsPerTile,
        y: drag.centerY - dy / pixelsPerTile,
      });
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let nearest: MinimapHover | null = null;
    let nearestDistance = HOVER_RADIUS;
    for (const marker of markersRef.current) {
      const distance = Math.hypot(marker.x - x, marker.y - y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = { x: marker.x, y: marker.y, creature: marker.creature };
      }
    }
    setHover(nearest);
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const beginPanelDrag = (
    event: ReactPointerEvent<HTMLElement>,
    resizeDirection: MinimapResizeDirection | null,
  ) => {
    const rect = sectionRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    panelDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      baseLayout: layout ?? {
        x: Math.max(0, Math.round(rect.left)),
        y: Math.max(0, Math.round(rect.top)),
        width: canvasWidth,
        height: canvasHeight,
      },
      resizeDirection,
    };
  };

  const onPanelDragMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = panelDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    if (drag.resizeDirection) {
      onLayoutChange(
        resizeMinimapLayout(drag.baseLayout, drag.resizeDirection, dx, dy),
      );
      return;
    }
    onLayoutChange({
      ...drag.baseLayout,
      x: Math.min(
        Math.max(0, window.innerWidth - 160),
        Math.max(0, Math.round(drag.baseLayout.x + dx)),
      ),
      y: Math.min(
        Math.max(0, window.innerHeight - 120),
        Math.max(0, Math.round(drag.baseLayout.y + dy)),
      ),
    });
  };

  const endPanelDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (panelDragRef.current?.pointerId === event.pointerId) {
      panelDragRef.current = null;
    }
  };

  const floorOffset = GROUND_FLOOR - floor;
  const floorLabel = floorOffset > 0 ? `+${floorOffset}` : `${floorOffset}`;
  const hoverCategories =
    hover?.creature.kind === "npc"
      ? shopCategories[hover.creature.name.toLowerCase()]?.slice(
          0,
          MAX_TOOLTIP_CATEGORIES,
        )
      : undefined;

  return (
    <section
      ref={sectionRef}
      aria-label={t("hud.minimap.title")}
      style={{ width: canvasWidth + PANEL_CHROME }}
      className="ui-panel-frame pointer-events-auto relative p-3"
    >
      <div
        className="mb-2 flex cursor-move touch-none items-center justify-between gap-2"
        title={t("hud.minimap.move")}
        onPointerDown={(event) => beginPanelDrag(event, null)}
        onPointerMove={onPanelDragMove}
        onPointerUp={endPanelDrag}
        onPointerCancel={endPanelDrag}
      >
        <h2 className="text-sm font-medium tracking-wide text-ui-text-bright uppercase">
          {t("hud.minimap.title")}
        </h2>
        <span className="rounded-sm border border-ui-stone-light/15 bg-black/30 px-1.5 py-0.5 text-[9px] font-medium tracking-wider text-ui-muted uppercase">
          {t("hud.minimap.floor")} {floorLabel}
        </span>
      </div>
      <div className="relative overflow-hidden rounded-lg border border-black/60">
        <canvas
          ref={canvasRef}
          style={{ width: canvasWidth, height: canvasHeight }}
          className="block cursor-crosshair touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={(event) => {
            onPointerEnd(event);
            setHover(null);
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.55)]"
        />
        <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
          <MinimapControlButton
            label={t("hud.minimap.floorUp")}
            disabled={floor <= MIN_FLOOR}
            onClick={() => setViewFloor(Math.max(MIN_FLOOR, floor - 1))}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 14l6-6 6 6" />
            </svg>
          </MinimapControlButton>
          <MinimapControlButton
            label={t("hud.minimap.floorDown")}
            disabled={floor >= MAX_FLOOR}
            onClick={() => setViewFloor(Math.min(MAX_FLOOR, floor + 1))}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 10l6 6 6-6" />
            </svg>
          </MinimapControlButton>
        </div>
        <div className="absolute right-1.5 bottom-1.5 flex flex-col gap-1">
          <MinimapControlButton
            label={t("hud.minimap.zoomIn")}
            disabled={zoomIndex >= ZOOM_LEVELS.length - 1}
            onClick={() =>
              setZoomIndex((index) =>
                Math.min(ZOOM_LEVELS.length - 1, index + 1),
              )
            }
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            >
              <path d="M12 6v12M6 12h12" />
            </svg>
          </MinimapControlButton>
          <MinimapControlButton
            label={t("hud.minimap.zoomOut")}
            disabled={zoomIndex <= 0}
            onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            >
              <path d="M6 12h12" />
            </svg>
          </MinimapControlButton>
        </div>
        {detached && (
          <div className="absolute bottom-1.5 left-1.5">
            <MinimapControlButton
              label={t("hud.minimap.recenter")}
              onClick={() => {
                setPanCenter(null);
                setViewFloor(null);
              }}
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="size-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="2.6" fill="currentColor" />
                <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
              </svg>
            </MinimapControlButton>
          </div>
        )}
        {hover && (
          <div
            style={{
              ...(hover.x <= canvasWidth / 2
                ? { left: hover.x + 10 }
                : { right: canvasWidth - hover.x + 10 }),
              top: Math.max(hover.y - 30, 4),
            }}
            className="pointer-events-none absolute z-10 max-w-56 rounded border border-ui-gold/25 bg-black/85 px-2 py-1"
          >
            <div className="truncate text-sm text-ui-text-bright">
              {hover.creature.name}
            </div>
            {hoverCategories && hoverCategories.length > 0 && (
              <div className="text-xs leading-tight text-ui-muted">
                {hoverCategories
                  .map((category) => t(`hud.minimap.categories.${category}`))
                  .join(" · ")}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between pr-4 text-[10px] tracking-wide text-ui-muted">
        <span>
          {Math.round(center.x)}, {Math.round(center.y)}, {floor}
        </span>
        <span className="flex items-center gap-1.5 uppercase">
          <span
            aria-hidden
            className="size-1.5 rotate-45 rounded-[1px] bg-[#66ccff]"
          />
          {t("hud.minimap.npcLegend")}
        </span>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute right-1 bottom-1 size-4 text-ui-muted"
      >
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        >
          <path d="M13 6.5 6.5 13M13 10.5 10.5 13" />
        </svg>
      </div>
      <MinimapResizeBorder
        label={t("hud.minimap.resize")}
        onPointerDown={beginPanelDrag}
        onPointerMove={onPanelDragMove}
        onPointerEnd={endPanelDrag}
      />
    </section>
  );
}
