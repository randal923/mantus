"use client";

import { useEffect, useRef, useState } from "react";
import type { Game, GameStats, SpellUiState } from "../lib/game/engine";

const EMPTY_STATS: GameStats = {
  hp: 400,
  maxHp: 400,
  mana: 200,
  maxMana: 200,
  kills: 0,
  spells: [],
};

const SLOT_COUNT = 5;

function SpellSlot({
  spell,
  hotkey,
  mana,
  onCast,
}: {
  spell?: SpellUiState;
  hotkey: string;
  mana: number;
  onCast: () => void;
}) {
  const onCooldown = !!spell && spell.remainingMs > 0;
  const noMana = !!spell && mana < spell.manaCost;
  const active = !!spell && spell.activeMs > 0;
  return (
    <button
      onClick={onCast}
      title={spell ? `${spell.name} — "${spell.words}" (${spell.manaCost} mana)` : "empty"}
      style={{
        position: "relative",
        width: 52,
        height: 52,
        padding: 0,
        background: "#1c1c1c",
        border: active ? "2px solid #44dd44" : "2px solid #555",
        borderRadius: 4,
        cursor: spell ? "pointer" : "default",
        overflow: "hidden",
      }}
    >
      {spell && (
        <img
          src={spell.icon}
          alt={spell.name}
          draggable={false}
          style={{
            width: 44,
            height: 44,
            imageRendering: "pixelated",
            opacity: noMana ? 0.35 : 1,
          }}
        />
      )}
      {onCooldown && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: `${(spell.remainingMs / spell.totalMs) * 100}%`,
            background: "rgba(0, 0, 0, 0.7)",
          }}
        />
      )}
      {onCooldown && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 13,
            fontWeight: "bold",
            textShadow: "0 0 3px #000",
          }}
        >
          {Math.ceil(spell.remainingMs / 1000)}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          top: 1,
          left: 3,
          color: "#ddd",
          fontSize: 10,
          fontWeight: "bold",
          textShadow: "0 0 2px #000",
        }}
      >
        {hotkey}
      </div>
      {active && (
        <div
          style={{
            position: "absolute",
            bottom: 1,
            right: 3,
            color: "#44dd44",
            fontSize: 9,
            fontWeight: "bold",
            textShadow: "0 0 2px #000",
          }}
        >
          {Math.ceil(spell.activeMs / 1000)}s
        </div>
      )}
    </button>
  );
}

export default function GameWindow() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [stats, setStats] = useState<GameStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let game: Game | undefined;

    (async () => {
      const { Game } = await import("../lib/game/engine");
      if (cancelled) return;
      const g = new Game(container, {
        onStats: (s) => setStats(s),
        onReady: () => setLoading(false),
      });
      game = g;
      gameRef.current = g;
      await g.start();
    })();

    return () => {
      cancelled = true;
      gameRef.current = null;
      game?.destroy();
    };
  }, []);

  const hpRatio = stats.hp / stats.maxHp;
  const manaRatio = stats.mana / stats.maxMana;

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
        <div style={{ marginBottom: 4 }}>
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
        <div style={{ margin: "6px 0 4px" }}>
          Mana {stats.mana} / {stats.maxMana}
        </div>
        <div style={{ height: 8, background: "#000030", borderRadius: 2, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${Math.round(manaRatio * 100)}%`,
              background: "#4060ff",
              transition: "width 0.2s",
            }}
          />
        </div>
        <div style={{ marginTop: 8 }}>Kills: {stats.kills}</div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 44,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 6,
          padding: 6,
          background: "rgba(20, 20, 20, 0.85)",
          border: "1px solid #555",
          borderRadius: 8,
          fontFamily: "Verdana, sans-serif",
        }}
      >
        {Array.from({ length: SLOT_COUNT }, (_, i) => (
          <SpellSlot
            key={i}
            spell={stats.spells[i]}
            hotkey={String(i + 1)}
            mana={stats.mana}
            onCast={() => gameRef.current?.castSpell(i)}
          />
        ))}
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
        WASD / arrows to walk · click or Space to target · 1–5 cast spells
      </div>
    </div>
  );
}
