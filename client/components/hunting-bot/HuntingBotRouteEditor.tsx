"use client";

import { useMemo, useState } from "react";
import type {
  HuntingBotRoute,
  HuntingBotStopReason,
  Position,
  ServerErrorCode,
} from "@tibia/protocol";
import { guideRouteFor } from "../../lib/hunting-bot/guideRouteFor";
import { insertWaypointAt } from "../../lib/hunting-bot/insertWaypointAt";
import type { HuntingPlace } from "../../lib/hunt-finder/HuntingPlace";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { HuntingBotRouteMap } from "./HuntingBotRouteMap";
import { HuntingBotWaypointList } from "./HuntingBotWaypointList";

const STOP_MESSAGE: Record<HuntingBotStopReason, string> = {
  died: "huntingBot.stopped.died",
  unreachable: "huntingBot.stopped.unreachable",
  "no-route": "huntingBot.stopped.noRoute",
  "out-of-range": "huntingBot.stopped.outOfRange",
};

const ERROR_MESSAGE: Partial<Record<ServerErrorCode, string>> = {
  "hunting-bot-out-of-range": "huntingBot.errors.outOfRange",
  "hunting-bot-wrong-floor": "huntingBot.errors.wrongFloor",
  "hunting-bot-invalid": "huntingBot.errors.invalid",
  "hunting-bot-update-failed": "huntingBot.errors.saveFailed",
};

interface HuntingBotRouteEditorProps {
  place: HuntingPlace;
  mapName: string;
  route: HuntingBotRoute;
  status: {
    readonly enabled: boolean;
    readonly waypointIndex: number;
    readonly stopReason: HuntingBotStopReason | null;
  } | null;
  error: ServerErrorCode | null;
  /** Waypoints the last trace could not reach; drawn red so they stand out. */
  unresolvedIndexes: ReadonlyArray<number>;
  tracing: boolean;
  ownPosition: Position | null;
  onRouteChange: (route: HuntingBotRoute) => void;
  onTrace: (points: ReadonlyArray<Position>) => void;
  onStart: () => void;
  onStop: () => void;
  onBack: () => void;
}

/**
 * Turns one hunting guide into a route the bot can walk, and arms it.
 *
 * The guide's own coordinates are only a starting point — they are drawn on a
 * wiki map and run through walls — so opening a hunt seeds them and
 * immediately asks the server, which owns walkability, to re-walk them around
 * the geometry. Everything after that is the player's to drag, insert and
 * delete.
 */
export function HuntingBotRouteEditor({
  place,
  mapName,
  route,
  status,
  error,
  unresolvedIndexes,
  tracing,
  ownPosition,
  onRouteChange,
  onTrace,
  onStart,
  onStop,
  onBack,
}: HuntingBotRouteEditorProps) {
  const { t } = useAppTranslation();
  const [tool, setTool] = useState<"select" | "add">("select");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const brokenIndexes = useMemo(
    () => new Set(unresolvedIndexes),
    [unresolvedIndexes],
  );

  const guideFloors = useMemo(
    () =>
      Object.keys(place.RoutePath.Coordinates)
        .map(Number)
        .filter((floor) => Number.isInteger(floor))
        .toSorted((left, right) => left - right),
    [place],
  );
  const routeFloors = useMemo(
    () =>
      [...new Set(route.waypoints.map((waypoint) => waypoint.z))].toSorted(
        (left, right) => left - right,
      ),
    [route.waypoints],
  );
  const floors = useMemo(
    () => [...new Set([...guideFloors, ...routeFloors])].toSorted(
      (left, right) => left - right,
    ),
    [guideFloors, routeFloors],
  );
  const [floor, setFloor] = useState<number | null>(null);
  const activeFloor =
    floor !== null && floors.includes(floor)
      ? floor
      : (floors.find((value) => value === ownPosition?.z) ??
        floors.at(0) ??
        (ownPosition?.z ?? 7));

  const seedFromGuide = (target: number): void => {
    const { waypoints } = guideRouteFor(place, target);
    onRouteChange({ huntName: place.Name, waypoints });
    setSelectedIndex(null);
    if (waypoints.length >= 2) onTrace(waypoints);
  };

  const setWaypoints = (waypoints: ReadonlyArray<Position>): void => {
    onRouteChange({ huntName: place.Name, waypoints: [...waypoints] });
  };

  const running = status?.enabled ?? false;
  const stopReason = !running ? (status?.stopReason ?? null) : null;
  const waypoints = route.waypoints;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Button size="sm" onClick={onBack}>
            {t("huntingBot.back")}
          </Button>
          <p className="truncate font-display text-ui-gold uppercase">
            {t("huntingBot.editing", { name: place.Name })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`size-2 rounded-full ${
              running
                ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                : "bg-ui-stone"
            }`}
          />
          <span className="text-xs tracking-widest text-ui-muted uppercase">
            {running
              ? t("huntingBot.walkingTo", {
                  index: (status?.waypointIndex ?? 0) + 1,
                  count: waypoints.length,
                })
              : t("huntingBot.idle")}
          </span>
          <Button
            variant={running ? "danger" : "primary"}
            onClick={running ? onStop : onStart}
            disabled={waypoints.length === 0}
          >
            {running ? t("huntingBot.stop") : t("huntingBot.start")}
          </Button>
        </div>
      </div>

      {error && ERROR_MESSAGE[error] && (
        <p role="alert" className="text-sm text-red-300">
          {t(ERROR_MESSAGE[error])}
        </p>
      )}
      {!error && stopReason && (
        <p role="status" className="text-sm text-ui-muted">
          {t(STOP_MESSAGE[stopReason])}
        </p>
      )}

      <div className="flex min-h-0 min-w-0 flex-col gap-3 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-ui-stone-light/25">
              {(["select", "add"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={tool === value}
                  onClick={() => setTool(value)}
                  className={`px-3 py-1 text-xs uppercase transition-colors ${
                    tool === value
                      ? "bg-ui-gold/20 text-ui-gold"
                      : "text-ui-muted hover:text-ui-text"
                  }`}
                >
                  {t(`huntingBot.tool.${value}`)}
                </button>
              ))}
            </div>
            {floors.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {floors.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={value === activeFloor}
                    onClick={() => setFloor(value)}
                    title={t("huntingBot.floor", { floor: value })}
                    className={`min-w-8 rounded-sm border px-2 py-0.5 text-xs transition-colors ${
                      value === activeFloor
                        ? "border-ui-gold/60 bg-ui-gold/15 text-ui-gold"
                        : "border-ui-stone-light/20 bg-black/30 text-ui-muted hover:text-ui-text"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            )}
            <span className="text-xs text-ui-muted">
              {t(`huntingBot.tool.${tool}Hint`)}
            </span>
          </div>

          <HuntingBotRouteMap
            mapName={mapName}
            huntName={place.Name}
            waypoints={waypoints}
            brokenIndexes={brokenIndexes}
            selectedIndex={selectedIndex}
            runningIndex={running ? (status?.waypointIndex ?? null) : null}
            floor={activeFloor}
            ownPosition={ownPosition}
            tool={tool}
            onSelect={setSelectedIndex}
            onMoveWaypoint={(index, position) => {
              setWaypoints(waypoints.with(index, position));
              setSelectedIndex(index);
            }}
            onInsertWaypoint={(position) => {
              setWaypoints(insertWaypointAt(waypoints, position));
            }}
            onDeleteWaypoint={(index) => {
              setWaypoints(waypoints.toSpliced(index, 1));
              setSelectedIndex(null);
            }}
          />
        </div>

        <div className="flex min-h-0 w-full flex-col gap-2 lg:w-72">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-display text-sm text-ui-gold uppercase">
              {t("huntingBot.route")}
            </h3>
            <span className="text-xs text-ui-muted">
              {t("huntingBot.waypoints", { count: waypoints.length })}
            </span>
          </div>
          {brokenIndexes.size > 0 && (
            <p role="status" className="text-xs text-red-300">
              {t("huntingBot.unresolvedCount", { count: brokenIndexes.size })}
            </p>
          )}
          <HuntingBotWaypointList
            waypoints={waypoints}
            brokenIndexes={brokenIndexes}
            selectedIndex={selectedIndex}
            runningIndex={running ? (status?.waypointIndex ?? null) : null}
            onSelect={setSelectedIndex}
            onDelete={(index) => {
              setWaypoints(waypoints.toSpliced(index, 1));
              setSelectedIndex(null);
            }}
            onMove={(index, direction) => {
              const target = index + direction;
              const moved = waypoints[index];
              const displaced = waypoints[target];
              if (!moved || !displaced) return;
              setWaypoints(
                waypoints.with(index, displaced).with(target, moved),
              );
              setSelectedIndex(target);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => onTrace(waypoints)}
              disabled={tracing || waypoints.length < 2}
            >
              {tracing ? t("huntingBot.tracing") : t("huntingBot.trace")}
            </Button>
            <Button
              size="sm"
              onClick={() => ownPosition && setWaypoints([...waypoints, ownPosition])}
              disabled={!ownPosition}
            >
              {t("huntingBot.addHere")}
            </Button>
            <Button
              size="sm"
              onClick={() => seedFromGuide(activeFloor)}
              disabled={!guideFloors.includes(activeFloor)}
            >
              {t("huntingBot.resetGuide")}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setWaypoints([]);
                setSelectedIndex(null);
              }}
              disabled={waypoints.length === 0}
            >
              {t("huntingBot.clear")}
            </Button>
          </div>
          <p className="text-xs text-ui-muted">{t("huntingBot.traceHint")}</p>
        </div>
      </div>
    </div>
  );
}
