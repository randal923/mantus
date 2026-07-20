"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Position } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { drawMinimap } from "../../lib/minimap/drawMinimap";
import { MinimapRegionStore } from "../../lib/minimap/MinimapRegionStore";
import { MapPinIcon } from "../ui/MapPinIcon";

const PIXELS_PER_TILE = 2;

interface HouseLocationMapProps {
  mapName: string;
  position: Position;
}

/** Read-only map preview centered on the selected house entrance. */
export function HouseLocationMap({
  mapName,
  position,
}: HouseLocationMapProps) {
  const { t } = useAppTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [regionVersion, setRegionVersion] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const store = useMemo(
    () =>
      new MinimapRegionStore(mapName, () =>
        setRegionVersion((version) => version + 1),
      ),
    [mapName],
  );

  useEffect(() => {
    let active = true;
    void store.load().then((loaded) => {
      if (active && !loaded) setUnavailable(true);
    });
    return () => {
      active = false;
      store.dispose();
    };
  }, [store]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width <= 0 || height <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    drawMinimap({
      canvas,
      store,
      center: { x: position.x, y: position.y },
      floor: position.z,
      pixelsPerTile: PIXELS_PER_TILE,
      creatures: [],
      ownPlayerId: "",
      ownPosition: null,
    });
  }, [position.x, position.y, position.z, regionVersion, store]);

  return (
    <section aria-label={t("house.location")} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-xs tracking-widest text-ui-gold uppercase">
          {t("house.location")}
        </h3>
        <span className="text-xs text-ui-muted tabular-nums">
          {position.x}, {position.y}, {position.z}
        </span>
      </div>
      <div className="relative h-56 overflow-hidden rounded-lg border border-black/60 bg-black">
        <canvas ref={canvasRef} aria-hidden className="block size-full" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 shadow-[inset_0_0_24px_rgba(0,0,0,0.65)]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 size-10 -translate-x-1/2 -translate-y-full drop-shadow-lg"
        >
          <MapPinIcon className="size-full" />
        </span>
        {unavailable && (
          <p className="absolute inset-0 flex items-center justify-center bg-black/70 text-xs text-ui-muted">
            {t("house.mapUnavailable")}
          </p>
        )}
      </div>
    </section>
  );
}
