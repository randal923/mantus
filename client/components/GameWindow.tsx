"use client";

import { useEffect, useRef, useState } from "react";
import type { GameStats } from "../lib/game/engine";

export default function GameWindow() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<GameStats>({ hp: 400, maxHp: 400, kills: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let game: { destroy: () => void } | undefined;

    (async () => {
      const { Game } = await import("../lib/game/engine");
      if (cancelled) return;
      const g = new Game(container, {
        onStats: (s) => setStats(s),
        onReady: () => setLoading(false),
      });
      game = g;
      await g.start();
    })();

    return () => {
      cancelled = true;
      game?.destroy();
    };
  }, []);

  const hpRatio = stats.hp / stats.maxHp;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden" }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ccc",
            fontFamily: "Verdana, sans-serif",
            fontSize: 14,
          }}
        >
          Loading Tibia assets…
        </div>
      )}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          padding: "10px 14px",
          background: "rgba(20, 20, 20, 0.85)",
          border: "1px solid #555",
          borderRadius: 6,
          color: "#eee",
          fontFamily: "Verdana, sans-serif",
          fontSize: 12,
          minWidth: 180,
        }}
      >
        <div style={{ marginBottom: 6 }}>
          HP {stats.hp} / {stats.maxHp}
        </div>
        <div style={{ height: 8, background: "#3a0000", borderRadius: 2, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${Math.round(hpRatio * 100)}%`,
              background: hpRatio > 0.5 ? "#00c000" : hpRatio > 0.2 ? "#c0c000" : "#c00000",
              transition: "width 0.2s",
            }}
          />
        </div>
        <div style={{ marginTop: 8 }}>Kills: {stats.kills}</div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "6px 12px",
          background: "rgba(20, 20, 20, 0.75)",
          border: "1px solid #444",
          borderRadius: 6,
          color: "#bbb",
          fontFamily: "Verdana, sans-serif",
          fontSize: 11,
          whiteSpace: "nowrap",
        }}
      >
        WASD / arrows to walk · click a monster (or press Space) to target · walk next to it to attack
      </div>
    </div>
  );
}
