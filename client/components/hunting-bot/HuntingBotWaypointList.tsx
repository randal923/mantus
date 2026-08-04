"use client";

import { useEffect, useRef } from "react";
import type { Position } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";

interface HuntingBotWaypointListProps {
  waypoints: ReadonlyArray<Position>;
  selectedIndex: number | null;
  /** The waypoint the running bot is walking toward, if any. */
  runningIndex: number | null;
  onSelect: (index: number) => void;
  /** Fires with the hovered row's index, and null when the pointer leaves. */
  onHover: (index: number | null) => void;
  onDelete: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}

/** The route as an ordered list: the half of the editor a mouse cannot do. */
export function HuntingBotWaypointList({
  waypoints,
  selectedIndex,
  runningIndex,
  onSelect,
  onHover,
  onDelete,
  onMove,
}: HuntingBotWaypointListProps) {
  const { t } = useAppTranslation();
  const listRef = useRef<HTMLUListElement | null>(null);

  // Selecting a waypoint on the map has to bring its row into view, or the
  // two halves of the editor disagree about what is selected.
  useEffect(() => {
    if (selectedIndex === null) return;
    listRef.current
      ?.querySelector(`[data-waypoint="${selectedIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (waypoints.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-sm text-ui-muted">
        {t("huntingBot.waypointsEmpty")}
      </p>
    );
  }

  return (
    <ul
      ref={listRef}
      className="ui-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto pr-1"
    >
      {waypoints.map((waypoint, index) => {
        const selected = index === selectedIndex;
        return (
          <li
            key={`${waypoint.x}.${waypoint.y}.${waypoint.z}.${index}`}
            data-waypoint={index}
            onPointerEnter={() => onHover(index)}
            onPointerLeave={() => onHover(null)}
            className={`flex items-center gap-2 rounded-sm border px-2 py-1 text-xs ${
              selected
                ? "border-ui-gold/60 bg-ui-gold/10"
                : "border-ui-stone-light/15 bg-black/20"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(index)}
              title={t("huntingBot.centre", { index: index + 1 })}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <span
                className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  index === runningIndex
                    ? "bg-emerald-400/80 text-black"
                    : "bg-ui-stone/60 text-ui-text"
                }`}
              >
                {index + 1}
              </span>
              <span className="truncate text-ui-text">
                {waypoint.x}, {waypoint.y}, {waypoint.z}
              </span>
            </button>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => onMove(index, -1)}
                disabled={index === 0}
                title={t("huntingBot.moveUp", { index: index + 1 })}
                aria-label={t("huntingBot.moveUp", { index: index + 1 })}
                className="rounded-sm px-1 text-ui-muted hover:text-ui-gold disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => onMove(index, 1)}
                disabled={index === waypoints.length - 1}
                title={t("huntingBot.moveDown", { index: index + 1 })}
                aria-label={t("huntingBot.moveDown", { index: index + 1 })}
                className="rounded-sm px-1 text-ui-muted hover:text-ui-gold disabled:opacity-30"
              >
                ▼
              </button>
              <button
                type="button"
                onClick={() => onDelete(index)}
                title={t("huntingBot.remove", { index: index + 1 })}
                aria-label={t("huntingBot.remove", { index: index + 1 })}
                className="rounded-sm px-1 text-ui-muted hover:text-red-300"
              >
                ✕
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
