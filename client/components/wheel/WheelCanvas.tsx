"use client";

import { WHEEL_REVELATION_THRESHOLDS, WHEEL_SLICES } from "@tibia/protocol";
import type { MouseEvent } from "react";
import { hitTestWheel } from "../../lib/wheel/hitTestWheel";
import {
  FILL_OPACITY,
  getFillStep,
  HOVER_FOCUS_OPACITY,
  ICON_SHEETS,
  MOD_ICON_OFFSET,
  NODE_ICON_SIZE,
  SMALL_ICON_OFFSET,
  SMALL_ICON_SIZE,
  UNLOCK_HINT_OPACITY,
  VESSEL_NODES,
  VOCATION_BACKDROP_IMAGES,
  VOCATION_ICON_CLIPS,
  WHEEL_BACKDROP_IMAGE,
  WHEEL_CANVAS_SIZE,
  WHEEL_CORNERS,
  WHEEL_NODES,
  type WheelClipRect,
  type WheelVocation,
} from "../../lib/wheel/wheelGeometry";

interface WheelCanvasProps {
  vocation: WheelVocation;
  /** Draft allocation being edited, index = slice id - 1. */
  slices: ReadonlyArray<number>;
  /** Slice ids that could receive a first point right now (unlock hints). */
  unlockableIds: ReadonlySet<number>;
  /** Points per domain quadrant, for the corner revelation medallions. */
  domainPoints: Readonly<Record<"green" | "red" | "blue" | "purple", number>>;
  selectedId: number | null;
  hoveredId: number | null;
  onHover: (id: number | null) => void;
  onSelect: (id: number) => void;
  /** Right-click fast action: fill the slice, or clear it when full. */
  onQuickToggle: (id: number) => void;
}

const QUADRANT_DOMAIN = {
  topLeft: "green",
  topRight: "red",
  bottomLeft: "blue",
  bottomRight: "purple",
} as const;

const sheetClipStyle = (sheet: string, clip: WheelClipRect) => ({
  width: clip.w,
  height: clip.h,
  backgroundImage: `url(${sheet})`,
  backgroundPosition: `-${clip.x}px -${clip.y}px`,
});

/**
 * The Tibia wheel, composited exactly like the original client: base frame,
 * per-slice fill overlays, hover/selection overlays, corner revelation
 * medallions, vocation backdrop, then the per-slice perk icons.
 */
export function WheelCanvas({
  vocation,
  slices,
  unlockableIds,
  domainPoints,
  selectedId,
  hoveredId,
  onHover,
  onSelect,
  onQuickToggle,
}: WheelCanvasProps) {
  const canvasPoint = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const iconClips = VOCATION_ICON_CLIPS[vocation];
  const hovered = hoveredId !== null ? WHEEL_NODES[hoveredId] : undefined;
  const selected = selectedId !== null ? WHEEL_NODES[selectedId] : undefined;

  return (
    <div
      role="img"
      aria-label="Wheel of Destiny"
      className="relative shrink-0 cursor-pointer select-none"
      style={{ width: WHEEL_CANVAS_SIZE, height: WHEEL_CANVAS_SIZE }}
      onMouseMove={(event) => {
        const { x, y } = canvasPoint(event);
        onHover(hitTestWheel(x, y));
      }}
      onMouseLeave={() => onHover(null)}
      onClick={(event) => {
        const { x, y } = canvasPoint(event);
        const id = hitTestWheel(x, y);
        if (id !== null) onSelect(id);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        const { x, y } = canvasPoint(event);
        const id = hitTestWheel(x, y);
        if (id !== null) onQuickToggle(id);
      }}
    >
      <img src={WHEEL_BACKDROP_IMAGE} alt="" draggable={false} className="absolute inset-0" />

      {WHEEL_SLICES.map((definition) => {
        const node = WHEEL_NODES[definition.id];
        const points = slices[definition.id - 1] ?? 0;
        if (!node) return null;
        if (points > 0) {
          const step = getFillStep(points, node);
          return (
            <img
              key={definition.id}
              src={`${node.fillImageDir}/${step}.png`}
              alt=""
              draggable={false}
              className="absolute inset-0"
              style={{ opacity: FILL_OPACITY }}
            />
          );
        }
        if (unlockableIds.has(definition.id)) {
          return (
            <img
              key={definition.id}
              src={`${node.fillImageDir}/${node.fillSteps}.png`}
              alt=""
              draggable={false}
              className="absolute inset-0"
              style={{ opacity: UNLOCK_HINT_OPACITY }}
            />
          );
        }
        return null;
      })}

      {hovered && hoveredId !== selectedId && (
        <img
          src={hovered.focusImage}
          alt=""
          draggable={false}
          className="absolute inset-0"
          style={{ opacity: HOVER_FOCUS_OPACITY }}
        />
      )}
      {selected && (
        <img
          src={selected.borderImage}
          alt=""
          draggable={false}
          className="absolute inset-0"
        />
      )}

      {Object.entries(WHEEL_CORNERS).map(([quadrant, corner]) => {
        const domain =
          QUADRANT_DOMAIN[quadrant as keyof typeof QUADRANT_DOMAIN];
        const points = domainPoints[domain];
        let stage = 0;
        for (const threshold of WHEEL_REVELATION_THRESHOLDS) {
          if (points >= threshold) stage += 1;
        }
        const previous =
          stage === 0 ? 0 : (WHEEL_REVELATION_THRESHOLDS[stage - 1] ?? 0);
        const next = WHEEL_REVELATION_THRESHOLDS[stage];
        const progress =
          next === undefined
            ? 1
            : Math.min(1, (points - previous) / (next - previous));
        const front =
          corner.frontImages[stage] ?? corner.frontImages[0] ?? "";
        return (
          <div key={quadrant} aria-hidden>
            <img
              src={corner.socketDisabled.image}
              alt=""
              draggable={false}
              className="absolute"
              style={{
                left: corner.socketDisabled.pos.x,
                top: corner.socketDisabled.pos.y,
              }}
            />
            <img
              src={corner.revelationBg.image}
              alt=""
              draggable={false}
              className="absolute"
              style={{
                left: corner.revelationBg.pos.x,
                top: corner.revelationBg.pos.y,
              }}
            />
            <div
              className="absolute rounded-full"
              style={{
                left: corner.progressRect.x,
                top: corner.progressRect.y,
                width: corner.progressRect.w,
                height: corner.progressRect.h,
                background: `conic-gradient(${corner.progressColor} ${
                  progress * 360
                }deg, transparent 0deg)`,
              }}
            />
            <img
              src={corner.backdropLight.image}
              alt=""
              draggable={false}
              className="absolute"
              style={{
                left: corner.backdropLight.pos.x,
                top: corner.backdropLight.pos.y,
              }}
            />
            <img
              src={front}
              alt=""
              draggable={false}
              className="absolute"
              style={{
                left: corner.revelationBg.pos.x,
                top: corner.revelationBg.pos.y,
              }}
            />
            <div
              className="absolute"
              style={{
                left: corner.perkIconPos.x,
                top: corner.perkIconPos.y,
                ...sheetClipStyle(
                  ICON_SHEETS.largePerks,
                  corner.perkIconClips[vocation],
                ),
              }}
            />
          </div>
        );
      })}

      <img
        src={VOCATION_BACKDROP_IMAGES[vocation]}
        alt=""
        draggable={false}
        className="pointer-events-none absolute inset-0"
      />

      {WHEEL_SLICES.map((definition) => {
        const node = WHEEL_NODES[definition.id];
        const clips = iconClips[definition.id];
        if (!node || !clips) return null;
        const vessel = VESSEL_NODES[definition.id];
        return (
          <div key={definition.id} aria-hidden>
            <div
              className="absolute"
              style={{
                left: node.iconCenter.x - NODE_ICON_SIZE / 2,
                top: node.iconCenter.y - NODE_ICON_SIZE / 2,
                ...sheetClipStyle(ICON_SHEETS.mediumPerks, clips.icon),
              }}
            />
            <div
              className="absolute"
              style={{
                left:
                  node.iconCenter.x + SMALL_ICON_OFFSET.x - SMALL_ICON_SIZE / 2,
                top:
                  node.iconCenter.y + SMALL_ICON_OFFSET.y - SMALL_ICON_SIZE / 2,
                ...sheetClipStyle(ICON_SHEETS.smallPerks, clips.miniIcon),
              }}
            />
            {vessel && (
              <img
                src={
                  vessel === "basic"
                    ? ICON_SHEETS.vesselResonanceBasic
                    : ICON_SHEETS.vesselResonanceSupreme
                }
                alt=""
                draggable={false}
                className="absolute"
                style={{
                  left: node.iconCenter.x + MOD_ICON_OFFSET.x - 5,
                  top: node.iconCenter.y + MOD_ICON_OFFSET.y - 5,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
