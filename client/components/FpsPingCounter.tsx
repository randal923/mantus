"use client";

import { useEffect, useState } from "react";
import { useAppTranslation } from "../i18n/useAppTranslation";

interface FpsPingCounterProps {
  /** Last measured server round trip in ms; null until the first pong. */
  latencyMs: number | null;
}

/** How long each frame-rate sample window lasts before the readout updates. */
const SAMPLE_WINDOW_MS = 500;

/** Small HUD readout of the browser frame rate and the server round trip. */
export function FpsPingCounter({ latencyMs }: FpsPingCounterProps) {
  const { t } = useAppTranslation();
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    let frames = 0;
    let windowStartedAt: number | null = null;
    let handle = requestAnimationFrame(function frame(now: number) {
      windowStartedAt ??= now;
      frames += 1;
      if (now - windowStartedAt >= SAMPLE_WINDOW_MS) {
        setFps(Math.round((frames * 1_000) / (now - windowStartedAt)));
        frames = 0;
        windowStartedAt = now;
      }
      handle = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(handle);
  }, []);

  return (
    <div
      aria-label={t("hud.performanceLabel")}
      title={t("hud.performanceLabel")}
      className="ui-panel-frame pointer-events-auto flex items-center gap-3 px-2.5 py-1 text-sm tabular-nums"
    >
      <span>
        <span className="text-ui-muted">{t("hud.fps")} </span>
        <span className="font-medium text-ui-text-bright">{fps ?? "–"}</span>
      </span>
      <span>
        <span className="text-ui-muted">{t("hud.ping")} </span>
        <span className="font-medium text-ui-text-bright">
          {latencyMs === null ? "–" : t("hud.pingValue", { ms: latencyMs })}
        </span>
      </span>
    </div>
  );
}
