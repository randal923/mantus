"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { HuntingPath } from "../../lib/hunt-finder/HuntingPlace";
import { MinimapRegionStore } from "../../lib/minimap/MinimapRegionStore";
import type { MinimapRoute } from "../../lib/minimap/MinimapRoute";
import { drawMinimap } from "../../lib/minimap/drawMinimap";
import { maskOutsideRoute } from "../../lib/minimap/maskOutsideRoute";
import { useAppTranslation } from "../../i18n/useAppTranslation";

const MAP_HEIGHT = 300;

function floorCenter(
  path: HuntingPath,
  floor: number,
): { center: { x: number; y: number }; pixelsPerTile: number } {
  const segments = path.Coordinates[String(floor)] ?? [];
  const points = segments.flatMap(([start, end]) => [start, end]);
  if (points.length === 0) return { center: { x: 0, y: 0 }, pixelsPerTile: 1 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    pixelsPerTile: Math.min(
      7,
      Math.max(0.3, Math.min(640 / (maxX - minX + 12), 250 / (maxY - minY + 12))),
    ),
  };
}

/** Ground kept lit around an isolated route, in tiles. */
const ISOLATION_RADIUS_TILES = 14;

interface HuntRouteMapProps {
  mapName: string;
  name: string;
  path: HuntingPath;
  /**
   * Black out everything the route does not reach. Wanted for the ring walked
   * inside a cave, never for the way there, which is all context.
   */
  isolate?: boolean;
}

export function HuntRouteMap({
  mapName,
  name,
  path,
  isolate = false,
}: HuntRouteMapProps) {
  const { t } = useAppTranslation();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(640);
  const [regionVersion, setRegionVersion] = useState(0);
  const floors = useMemo(
    () => Object.keys(path.Coordinates).map(Number).toSorted((a, b) => a - b),
    [path],
  );
  const [selectedFloor, setSelectedFloor] = useState(
    () => floors.at(-1) ?? 7,
  );
  const floor = floors.includes(selectedFloor)
    ? selectedFloor
    : (floors.at(-1) ?? 7);
  const store = useMemo(
    () =>
      new MinimapRegionStore(mapName, () =>
        setRegionVersion((version) => version + 1),
      ),
    [mapName],
  );
  const route = useMemo<MinimapRoute>(
    () => ({
      name,
      coordinates: path.Coordinates,
      destination: path.Position,
    }),
    [name, path],
  );

  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.floor(entry.contentRect.width)));
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = MAP_HEIGHT * dpr;
    const view = floorCenter(path, floor);
    drawMinimap({
      canvas,
      store,
      center: view.center,
      floor,
      pixelsPerTile: view.pixelsPerTile,
      creatures: [],
      ownPlayerId: "",
      ownPosition: null,
      towns: store.towns,
      showTownLabels: view.pixelsPerTile <= 2,
      route,
    });
    if (isolate) {
      maskOutsideRoute({
        canvas,
        waypoints: (path.Coordinates[String(floor)] ?? []).flatMap(
          ([start, end]) => [start, end],
        ),
        center: view.center,
        floor,
        pixelsPerTile: view.pixelsPerTile,
        radiusTiles: ISOLATION_RADIUS_TILES,
      });
    }
  }, [floor, isolate, path, regionVersion, route, store, width]);

  return (
    <div ref={hostRef} className="overflow-hidden rounded-sm border border-black/70 bg-black">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ui-stone-light/15 bg-ui-panel-deep px-2 py-1.5">
        <span className="text-xs tracking-widest text-ui-muted uppercase">
          {t("huntFinder.map.floor", { floor })}
        </span>
        <div className="flex flex-wrap gap-1">
          {floors.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === floor}
              onClick={() => setSelectedFloor(value)}
              className={`min-w-8 rounded-sm border px-2 py-0.5 text-xs transition-colors ${
                value === floor
                  ? "border-ui-gold/60 bg-ui-gold/15 text-ui-gold"
                  : "border-ui-stone-light/20 bg-black/30 text-ui-muted hover:text-ui-text"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width, height: MAP_HEIGHT }}
        className="block max-w-full"
        aria-label={t("huntFinder.map.label", { name })}
      />
    </div>
  );
}
