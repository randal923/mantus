"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  CreatureState,
  MinimapLayout,
  MinimapMarker as MapMarker,
  Position,
} from "@tibia/protocol";
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
  resizeDirection: MinimapResizeDirection;
}

interface MinimapPanelProps {
  mapName: string;
  ownPlayerId: string;
  ownPosition: Position;
  creatures: ReadonlyArray<CreatureState>;
  layout: MinimapLayout | null;
  /** The character's own persisted waypoint flags, from the server. */
  mapMarkers: ReadonlyArray<MapMarker>;
  onLayoutChange: (layout: MinimapLayout) => void;
  /** Sends a walk-to intent; the server computes and validates the path. */
  onWalkTo: (position: Position) => void;
  onToggleMarker: (position: Position) => void;
}

export function MinimapPanel({
  mapName,
  ownPlayerId,
  ownPosition,
  creatures,
  layout,
  mapMarkers,
  onLayoutChange,
  onWalkTo,
  onToggleMarker,
}: MinimapPanelProps) {
  const { t } = useAppTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const markersRef = useRef<MinimapMarker[]>([]);
  const dragRef = useRef<MinimapDrag | null>(null);
  const panelDragRef = useRef<PanelDrag | null>(null);
  const [regionVersion, setRegionVersion] = useState(0);
  const store = useMemo(
    () =>
      new MinimapRegionStore(mapName, () =>
        setRegionVersion((version) => version + 1),
      ),
    [mapName],
  );
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [viewFloor, setViewFloor] = useState<number | null>(null);
  const [panCenter, setPanCenter] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [hover, setHover] = useState<MinimapHover | null>(null);
  const [shopCategories, setShopCategories] = useState<NpcShopCategories>({});

  const floor = viewFloor ?? ownPosition.z;
  const centerX = panCenter?.x ?? ownPosition.x;
  const centerY = panCenter?.y ?? ownPosition.y;
  const pixelsPerTile = ZOOM_LEVELS[zoomIndex] ?? 3;
  /** Locked = the view follows the character; panning or a floor change frees it. */
  const locked = panCenter === null && viewFloor === null;
  const canvasWidth = layout?.width ?? DEFAULT_CANVAS_WIDTH;
  const canvasHeight = layout?.height ?? DEFAULT_CANVAS_HEIGHT;

  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);

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
      center: { x: centerX, y: centerY },
      floor,
      pixelsPerTile,
      creatures,
      ownPlayerId,
      ownPosition,
      mapMarkers,
      towns: store.towns,
      showTownLabels: pixelsPerTile <= 2,
    });
  }, [
    store,
    regionVersion,
    mapMarkers,
    centerX,
    centerY,
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
      centerX,
      centerY,
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

  /** Canvas pixel -> world tile, using the same transform drawMinimap uses. */
  const tileAt = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): Position => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.round(
        centerX + (event.clientX - rect.left - rect.width / 2) / pixelsPerTile,
      ),
      y: Math.round(
        centerY + (event.clientY - rect.top - rect.height / 2) / pixelsPerTile,
      ),
      z: floor,
    };
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      dragRef.current = null;
      // A click that did not pan is a walk-to request. The client only names
      // the tile; the server routes and re-validates every step.
      if (!drag.moved && floor === ownPosition.z) onWalkTo(tileAt(event));
    }
  };

  const toggleLock = () => {
    if (!locked) {
      setPanCenter(null);
      setViewFloor(null);
      return;
    }
    // Unlocking freezes the view where it currently sits.
    setPanCenter({ x: centerX, y: centerY });
    setViewFloor(floor);
  };

  const onContextMenu = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    onToggleMarker(tileAt(event));
  };

  const beginPanelDrag = (
    event: ReactPointerEvent<HTMLElement>,
    resizeDirection: MinimapResizeDirection,
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
    onLayoutChange(
      resizeMinimapLayout(drag.baseLayout, drag.resizeDirection, dx, dy),
    );
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
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium tracking-wide text-ui-text-bright uppercase">
          {t("hud.minimap.title")}
        </h2>
        <span className="rounded-sm border border-ui-stone-light/15 bg-black/30 px-1.5 py-0.5 text-xs font-medium tracking-wider text-ui-muted uppercase">
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
          onContextMenu={onContextMenu}
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
        <div className="absolute bottom-1.5 left-1.5">
          <MinimapControlButton
            label={t(locked ? "hud.minimap.unlock" : "hud.minimap.lock")}
            onClick={toggleLock}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className={locked ? "size-3.5 text-ui-gold" : "size-3.5"}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path
                d={
                  locked ? "M7 11V7a5 5 0 0 1 10 0v4" : "M7 11V7a5 5 0 0 1 9.9-1"
                }
              />
            </svg>
          </MinimapControlButton>
        </div>
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
              <div className="text-sm leading-tight text-ui-muted">
                {hoverCategories
                  .map((category) => t(`hud.minimap.categories.${category}`))
                  .join(" · ")}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between pr-4 text-xs tracking-wide text-ui-muted">
        <span>
          {Math.round(centerX)}, {Math.round(centerY)}, {floor}
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
        className="pointer-events-none absolute top-1 left-1 size-4 text-ui-muted"
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
          <path d="M3 9.5 9.5 3M3 5.5 5.5 3" />
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
