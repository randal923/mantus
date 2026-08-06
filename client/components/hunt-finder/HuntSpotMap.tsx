"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { HuntingSpot } from "../../lib/hunt-finder/HuntingPlace";
import { MinimapRegionStore } from "../../lib/minimap/MinimapRegionStore";
import type { MinimapRoute } from "../../lib/minimap/MinimapRoute";
import { drawMinimap } from "../../lib/minimap/drawMinimap";
import { spotMapView } from "../../lib/hunt-finder/spotMapView";
import { useAppTranslation } from "../../i18n/useAppTranslation";

/** Floor for the canvas before the container has been measured. */
const MIN_MAP_HEIGHT = 220;

interface HuntSpotMapProps {
  mapName: string;
  spots: ReadonlyArray<HuntingSpot>;
  selectedName: string | null;
  onSelect: (spot: HuntingSpot) => void;
}

/**
 * The caves of one hunt, drawn where they are.
 *
 * A city's worm caves are the same hunt with different ways in, so the choice
 * is a place on the map rather than a row in a list: every entrance is a pin
 * the player can read the walk to, and clicking one opens that cave's route.
 */
export function HuntSpotMap({
  mapName,
  spots,
  selectedName,
  onSelect,
}: HuntSpotMapProps) {
  const { t } = useAppTranslation();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 640, height: MIN_MAP_HEIGHT });
  const [regionVersion, setRegionVersion] = useState(0);
  const store = useMemo(
    () =>
      new MinimapRegionStore(mapName, () =>
        setRegionVersion((version) => version + 1),
      ),
    [mapName],
  );
  const view = useMemo(
    () => spotMapView(spots, size.width, size.height),
    [size, spots],
  );
  // Every cave's ring at once, so the pins sit on the ground they patrol.
  const route = useMemo<MinimapRoute>(() => {
    const coordinates: Record<string, Array<[unknown, unknown]>> = {};
    for (const spot of spots) {
      for (const [floor, segments] of Object.entries(
        spot.RoutePath.Coordinates,
      )) {
        coordinates[floor] = [
          ...(coordinates[floor] ?? []),
          ...(segments as Array<[unknown, unknown]>),
        ];
      }
    }
    return {
      name: "",
      coordinates: coordinates as MinimapRoute["coordinates"],
      destination: undefined,
    };
  }, [spots]);

  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // The map fills whatever the window gives it, so the pins spread over the
    // real estate rather than a fixed strip of it.
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({
        width: Math.max(280, Math.floor(entry.contentRect.width)),
        height: Math.max(MIN_MAP_HEIGHT, Math.floor(entry.contentRect.height)),
      });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    drawMinimap({
      canvas,
      store,
      center: view.center,
      floor: view.floor,
      pixelsPerTile: view.pixelsPerTile,
      creatures: [],
      ownPlayerId: "",
      ownPosition: null,
      towns: store.towns,
      showTownLabels: true,
      route,
    });
  }, [regionVersion, route, size, store, view]);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-sm border border-black/70 bg-black">
      <div className="border-b border-ui-stone-light/15 bg-ui-panel-deep px-2 py-1.5 text-xs tracking-widest text-ui-muted uppercase">
        {t("huntFinder.spots.pick", { count: spots.length })}
      </div>
      <div ref={hostRef} className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          style={{ width: size.width, height: size.height }}
          className="block max-w-full"
          aria-hidden="true"
        />
        {spots.map((spot) => {
          const point = view.project(spot.Position);
          const selected = spot.Name === selectedName;
          const tooltip = t("huntFinder.spots.tooltip", {
            name: spot.Name,
            x: spot.Position.x,
            y: spot.Position.y,
            floor: spot.Position.z,
          });
          return (
            <button
              key={spot.Name}
              type="button"
              title={tooltip}
              // The pin's own label is the cave name; the walk to it belongs in
              // the name a screen reader reads, not only in a hover tooltip.
              aria-label={tooltip}
              aria-pressed={selected}
              onClick={() => onSelect(spot)}
              style={{ left: point.x, top: point.y }}
              className={`group absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 p-0 transition-transform hover:scale-110 focus-visible:outline-none ${
                selected
                  ? "border-ui-gold bg-ui-gold/80 shadow-[0_0_10px_rgba(200,160,60,0.9)]"
                  : "border-cyan-200 bg-cyan-400/70 hover:border-ui-gold"
              }`}
            >
              <span className="block size-4" />
              {/* Named on sight: a handful of pins on a desert read as
                  identical dots otherwise, and the point of the map is to
                  tell them apart. */}
              <span
                className={`pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-sm border px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap transition-colors ${
                  selected
                    ? "border-ui-gold/60 bg-black/95 text-ui-gold"
                    : "border-ui-stone-light/30 bg-black/85 text-ui-text-bright group-hover:border-ui-gold/60 group-hover:text-ui-gold"
                }`}
              >
                {spot.Name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
