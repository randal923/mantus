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
import type {
  HuntingPlace,
  HuntingSpot,
} from "../../lib/hunt-finder/HuntingPlace";
import { huntRouteName } from "../../lib/hunting-bot/huntRouteName";
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
  /** The cave of that hunt being walked; hunts with one cave pass their own. */
  spot: HuntingSpot;
  mapName: string;
  route: HuntingBotRoute;
  status: {
    readonly enabled: boolean;
    readonly waypointIndex: number;
    readonly stopReason: HuntingBotStopReason | null;
  } | null;
  error: ServerErrorCode | null;
  ownPosition: Position | null;
  onRouteChange: (route: HuntingBotRoute) => void;
  onStart: () => void;
  onStop: () => void;
  onBack: () => void;
}

/**
 * Turns one hunting guide into a route the bot can walk, and arms it.
 *
 * The route is the guide's own hunt-route waypoints, kept as drawn: the bot
 * pathfinds to each one as a destination, so the sparse ring is enough. The
 * player can drag, insert and delete freely.
 */
export function HuntingBotRouteEditor({
  place,
  spot,
  mapName,
  route,
  status,
  error,
  ownPosition,
  onRouteChange,
  onStart,
  onStop,
  onBack,
}: HuntingBotRouteEditorProps) {
  const { t } = useAppTranslation();
  const [tool, setTool] = useState<"select" | "add">("select");
  // On by default: a cave floor is a warren of unrelated caves, and the point
  // of this map is the one being edited.
  const [isolate, setIsolate] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const huntName = huntRouteName(place.Name, spot.Name);
  const guideFloors = useMemo(
    () =>
      Object.keys(spot.RoutePath.Coordinates)
        .map(Number)
        .filter((floor) => Number.isInteger(floor))
        .toSorted((left, right) => left - right),
    [spot],
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
    const { waypoints } = guideRouteFor(spot, target);
    onRouteChange({ huntName, waypoints });
    setSelectedIndex(null);
  };

  const setWaypoints = (waypoints: ReadonlyArray<Position>): void => {
    onRouteChange({ huntName, waypoints: [...waypoints] });
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
            {t("huntingBot.editing", { name: huntName })}
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

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-md border border-ui-stone-light/25">
          {(["select", "add"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={tool === value}
              onClick={() => setTool(value)}
              className={`px-5 py-2 text-sm uppercase transition-colors ${
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
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-xs tracking-widest text-ui-muted uppercase">
              {t("huntingBot.floorLabel")}
            </span>
            {floors.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={value === activeFloor}
                onClick={() => setFloor(value)}
                title={t("huntingBot.floor", { floor: value })}
                className={`min-w-9 rounded-sm border px-2 py-1.5 text-sm transition-colors ${
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
        <label className="flex cursor-pointer items-center gap-2 text-xs tracking-widest text-ui-muted uppercase">
          <input
            type="checkbox"
            checked={isolate}
            onChange={(event) => setIsolate(event.currentTarget.checked)}
            className="size-4 accent-ui-gold"
          />
          {t("huntingBot.isolate")}
        </label>
        <span className="text-xs text-ui-muted">
          {t(`huntingBot.tool.${tool}Hint`)}
        </span>
      </div>

      <div className="flex min-h-0 min-w-0 flex-col gap-3 lg:flex-row lg:items-stretch">
        <div className="min-w-0 flex-1">
          <HuntingBotRouteMap
            mapName={mapName}
            huntName={huntName}
            waypoints={waypoints}
            selectedIndex={selectedIndex}
            runningIndex={running ? (status?.waypointIndex ?? null) : null}
            highlightIndex={hoveredIndex}
            floor={activeFloor}
            ownPosition={ownPosition}
            tool={tool}
            isolate={isolate}
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

        {/* The absolute inner keeps a long list from stretching the row, so
            the route column can only ever be as tall as the map. */}
        <div className="relative h-80 w-full lg:h-auto lg:w-72 lg:shrink-0">
          <div className="flex h-full flex-col gap-2 lg:absolute lg:inset-0">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-display text-sm text-ui-gold uppercase">
                {t("huntingBot.route")}
              </h3>
              <span className="text-xs text-ui-muted">
                {t("huntingBot.waypoints", { count: waypoints.length })}
              </span>
            </div>
            <HuntingBotWaypointList
              waypoints={waypoints}
              selectedIndex={selectedIndex}
              runningIndex={running ? (status?.waypointIndex ?? null) : null}
              activeFloor={activeFloor}
              onSelect={setSelectedIndex}
              onHover={setHoveredIndex}
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
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
    </div>
  );
}
