"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Position } from "@tibia/protocol";
import { MinimapRegionStore } from "../../lib/minimap/MinimapRegionStore";
import { drawMinimap } from "../../lib/minimap/drawMinimap";
import { minimapPixelToTile } from "../../lib/minimap/minimapPixelToTile";
import { worldToMinimapPixel } from "../../lib/minimap/worldToMinimapPixel";
import { useAppTranslation } from "../../i18n/useAppTranslation";

const ZOOM_LEVELS = [1, 2, 3, 4, 6, 8] as const;
const MAP_HEIGHT = 420;
const GRAB_RADIUS = 9;
/** Pointer travel below this is a click, not a drag (matches the minimap). */
const DRAG_SLOP = 4;

interface Drag {
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly mode: "pan" | "waypoint";
  readonly index: number;
  readonly grabOffsetX: number;
  readonly grabOffsetY: number;
  readonly centerX: number;
  readonly centerY: number;
  moved: boolean;
}

interface HuntingBotRouteMapProps {
  mapName: string;
  huntName: string;
  waypoints: ReadonlyArray<Position>;
  brokenIndexes: ReadonlySet<number>;
  selectedIndex: number | null;
  /** The waypoint the running bot is walking toward, if any. */
  runningIndex: number | null;
  floor: number;
  ownPosition: Position | null;
  tool: "select" | "add";
  onSelect: (index: number | null) => void;
  onMoveWaypoint: (index: number, position: Position) => void;
  onInsertWaypoint: (position: Position) => void;
  onDeleteWaypoint: (index: number) => void;
}

/**
 * The editable route map. Waypoints are dragged, inserted and deleted here;
 * the chain itself lives in the parent, so this stays a pure view over it.
 */
export function HuntingBotRouteMap({
  mapName,
  huntName,
  waypoints,
  brokenIndexes,
  selectedIndex,
  runningIndex,
  floor,
  ownPosition,
  tool,
  onSelect,
  onMoveWaypoint,
  onInsertWaypoint,
  onDeleteWaypoint,
}: HuntingBotRouteMapProps) {
  const { t } = useAppTranslation();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [width, setWidth] = useState(640);
  const [regionVersion, setRegionVersion] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(3);
  // The pan remembers which floor it was made on, so switching floors
  // re-frames the new one without an effect resetting state after the fact.
  const [panCenter, setPanCenter] = useState<{
    floor: number;
    x: number;
    y: number;
  } | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const pixelsPerTile = ZOOM_LEVELS[zoomIndex] ?? 4;

  const store = useMemo(
    () =>
      new MinimapRegionStore(mapName, () =>
        setRegionVersion((version) => version + 1),
      ),
    [mapName],
  );

  const floorWaypoints = useMemo(
    () => waypoints.filter((waypoint) => waypoint.z === floor),
    [waypoints, floor],
  );

  // Where the map looks when nothing has been panned: centred on this
  // floor's waypoints, or on the character when the floor is still empty.
  const defaultCenter = useMemo(() => {
    if (floorWaypoints.length === 0) {
      return ownPosition
        ? { x: ownPosition.x, y: ownPosition.y }
        : { x: 32_000, y: 32_000 };
    }
    const xs = floorWaypoints.map((waypoint) => waypoint.x);
    const ys = floorWaypoints.map((waypoint) => waypoint.y);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  }, [floorWaypoints, ownPosition]);
  const center = panCenter?.floor === floor ? panCenter : defaultCenter;

  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, Math.floor(entry.contentRect.width)));
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // React's onWheel is passive, so zoom has to be a native listener or the
    // modal scrolls behind the map instead.
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = MAP_HEIGHT * dpr;
    drawMinimap({
      canvas,
      store,
      center,
      floor,
      pixelsPerTile,
      creatures: [],
      ownPlayerId: "",
      ownPosition,
      towns: store.towns,
      showTownLabels: pixelsPerTile <= 2,
      waypoints,
      activeWaypointIndex: hoverIndex ?? selectedIndex ?? runningIndex,
      brokenWaypointIndexes: brokenIndexes,
    });
  }, [
    brokenIndexes,
    center,
    floor,
    hoverIndex,
    ownPosition,
    pixelsPerTile,
    regionVersion,
    runningIndex,
    selectedIndex,
    store,
    waypoints,
    width,
  ]);

  const view = { center, width, height: MAP_HEIGHT, pixelsPerTile, floor };

  const waypointAt = (canvasX: number, canvasY: number): number | null => {
    let nearest: number | null = null;
    let nearestDistance = GRAB_RADIUS;
    waypoints.forEach((waypoint, index) => {
      if (waypoint.z !== floor) return;
      const pixel = worldToMinimapPixel(waypoint, view);
      const distance = Math.hypot(pixel.x - canvasX, pixel.y - canvasY);
      if (distance > nearestDistance) return;
      nearestDistance = distance;
      nearest = index;
    });
    return nearest;
  };

  const canvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = canvasPoint(event);
    const index = waypointAt(point.x, point.y);
    const grabbed = index === null ? null : waypoints[index];
    const fractional = minimapPixelToTile(point, view, true);
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      mode: grabbed ? "waypoint" : "pan",
      index: index ?? -1,
      // Keeps the dot under the part of it that was grabbed.
      grabOffsetX: grabbed ? grabbed.x - fractional.x : 0,
      grabOffsetY: grabbed ? grabbed.y - fractional.y : 0,
      centerX: center.x,
      centerY: center.y,
      moved: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const point = canvasPoint(event);
    if (!drag || drag.pointerId !== event.pointerId) {
      setHoverIndex(waypointAt(point.x, point.y));
      return;
    }
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < DRAG_SLOP) return;
    drag.moved = true;
    if (drag.mode === "pan") {
      setPanCenter({
        floor,
        x: drag.centerX - dx / pixelsPerTile,
        y: drag.centerY - dy / pixelsPerTile,
      });
      return;
    }
    const fractional = minimapPixelToTile(point, view, true);
    onMoveWaypoint(drag.index, {
      x: Math.round(fractional.x + drag.grabOffsetX),
      y: Math.round(fractional.y + drag.grabOffsetY),
      z: floor,
    });
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.moved) return;
    if (drag.mode === "waypoint") {
      onSelect(drag.index);
      return;
    }
    if (tool === "add") {
      onInsertWaypoint(minimapPixelToTile(canvasPoint(event), view));
      return;
    }
    onSelect(null);
  };

  return (
    <div
      ref={hostRef}
      className="min-w-0 overflow-hidden rounded-sm border border-black/70 bg-black"
    >
      <canvas
        ref={canvasRef}
        style={{ width, height: MAP_HEIGHT }}
        className="block max-w-full touch-none"
        aria-label={t("huntingBot.mapLabel", { name: huntName })}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={() => setHoverIndex(null)}
        onContextMenu={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          const index = waypointAt(
            event.clientX - rect.left,
            event.clientY - rect.top,
          );
          if (index !== null) onDeleteWaypoint(index);
        }}
      />
    </div>
  );
}
