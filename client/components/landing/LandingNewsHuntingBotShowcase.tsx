"use client";

import { useEffect, useState } from "react";
import type { BestiaryCreatureEntry, Position } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useHuntingPlaces } from "../../hooks/useHuntingPlaces";
import { guideRouteFor } from "../../lib/hunting-bot/guideRouteFor";
import { insertWaypointAt } from "../../lib/hunting-bot/insertWaypointAt";
import { huntingSpots } from "../../lib/hunt-finder/huntingSpots";
import { HuntingPlaceCard } from "../hunt-finder/HuntingPlaceCard";
import { HuntingBotRouteMap } from "../hunting-bot/HuntingBotRouteMap";
import { HuntingBotWaypointList } from "../hunting-bot/HuntingBotWaypointList";
import { Button } from "../ui/Button";

const MAP_NAME = "otservbr";
const FEATURED_CARDS = [
  "Amazon Camp",
  "Venore Dragon Lair",
  "Darashia Dragon Lords",
];
const RUN_STEP_MS = 1500;

/**
 * Outfits of the featured hunts' monsters (from `content/monsters/
 * world-monsters.json`), so the cards animate their sprites without a
 * bestiary session. Keys are pre-normalized (`normalizeHuntName`).
 */
const SHOWCASE_CREATURES: ReadonlyMap<string, BestiaryCreatureEntry> = new Map(
  (
    [
      ["amazon", 1, "Amazon", "Human", 137, 113, 120, 95, 115],
      ["valkyrie", 2, "Valkyrie", "Human", 139, 113, 38, 76, 96],
      ["witch", 3, "Witch", "Human", 54, 0, 0, 0, 0],
      ["dragon", 4, "Dragon", "Dragon", 34, 0, 0, 0, 0],
      ["dragon lord", 5, "Dragon Lord", "Dragon", 39, 0, 0, 0, 0],
    ] as const
  ).map(([key, raceId, name, className, lookType, head, body, legs, feet]) => [
    key,
    {
      raceId,
      name,
      className,
      outfit: { lookType, head, body, legs, feet, addons: 0 },
      stage: 0,
      kills: 0,
    },
  ]),
);

/**
 * A clickable, minified hunting-bot: pick one of the featured hunting grounds,
 * then edit its guide route on the real map (drag, add, delete waypoints) and
 * start a pretend hunt that walks the ring. Local state only; nothing is sent
 * anywhere.
 */
export function LandingNewsHuntingBotShowcase() {
  const { t } = useAppTranslation();
  const { places } = useHuntingPlaces();
  const [selectedHunt, setSelectedHunt] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<ReadonlyArray<Position>>([]);
  const [floor, setFloor] = useState<number | null>(null);
  const [tool, setTool] = useState<"select" | "add">("select");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [runningIndex, setRunningIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!running || waypoints.length === 0) return;
    const timer = setInterval(
      () =>
        setRunningIndex(
          (index) => ((index ?? 0) + 1) % Math.max(1, waypoints.length),
        ),
      RUN_STEP_MS,
    );
    return () => clearInterval(timer);
  }, [running, waypoints.length]);

  const cards = FEATURED_CARDS.flatMap((name) => {
    const place = places.find((candidate) => candidate.Name === name);
    return place ? [place] : [];
  });
  if (cards.length === 0) return null;

  const place = selectedHunt
    ? cards.find((candidate) => candidate.Name === selectedHunt)
    : undefined;
  const floors = [...new Set(waypoints.map((waypoint) => waypoint.z))].toSorted(
    (left, right) => left - right,
  );
  const activeFloor =
    floor !== null && floors.includes(floor) ? floor : (floors.at(0) ?? 7);

  const openHunt = (name: string): void => {
    const target = cards.find((candidate) => candidate.Name === name);
    if (!target) return;
    const guide = guideRouteFor(huntingSpots(target)[0], null);
    setSelectedHunt(name);
    setWaypoints(guide.waypoints);
    setFloor(guide.floor);
    setTool("select");
    setSelectedIndex(null);
    setHoveredIndex(null);
    setRunning(false);
    setRunningIndex(null);
  };

  const deleteWaypoint = (index: number): void => {
    setWaypoints((current) => current.toSpliced(index, 1));
    setSelectedIndex(null);
    setHoveredIndex(null);
  };

  if (!place) {
    return (
      <figure className="rounded-lg border border-ui-stone-light/15 bg-black/20 p-4 font-tibia">
        <figcaption className="mb-3 font-display text-sm tracking-[0.1em] text-ui-gold uppercase">
          {t("huntingBot.selectHunt")}
        </figcaption>
        <div className="grid gap-3">
          {cards.map((card) => (
            <HuntingPlaceCard
              key={card.Name}
              place={card}
              creaturesByName={SHOWCASE_CREATURES}
              onSelect={() => openHunt(card.Name)}
            />
          ))}
        </div>
      </figure>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-ui-stone-light/15 bg-black/20 p-4 font-tibia">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Button size="sm" onClick={() => setSelectedHunt(null)}>
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
                  index: (runningIndex ?? 0) + 1,
                  count: waypoints.length,
                })
              : t("huntingBot.idle")}
          </span>
          <Button
            size="sm"
            variant={running ? "danger" : "primary"}
            disabled={waypoints.length === 0}
            onClick={() => {
              setRunning((current) => !current);
              setRunningIndex(running ? null : 0);
            }}
          >
            {running ? t("huntingBot.stop") : t("huntingBot.start")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-md border border-ui-stone-light/25">
          {(["select", "add"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={tool === value}
              onClick={() => setTool(value)}
              className={`px-4 py-1.5 text-sm uppercase transition-colors ${
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
                className={`min-w-9 rounded-sm border px-2 py-1 text-sm transition-colors ${
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

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_13rem]">
        <HuntingBotRouteMap
          mapName={MAP_NAME}
          huntName={place.Name}
          waypoints={waypoints}
          selectedIndex={selectedIndex}
          runningIndex={running ? runningIndex : null}
          highlightIndex={hoveredIndex}
          floor={activeFloor}
          ownPosition={null}
          tool={tool}
          isolate
          onSelect={setSelectedIndex}
          onMoveWaypoint={(index, position) =>
            setWaypoints((current) => current.with(index, position))
          }
          onInsertWaypoint={(position) =>
            setWaypoints((current) => insertWaypointAt(current, position))
          }
          onDeleteWaypoint={deleteWaypoint}
        />
        <div className="flex max-h-60 flex-col gap-2 lg:max-h-[600px]">
          <p className="text-xs text-ui-muted">
            {t("huntingBot.waypoints", { count: waypoints.length })}
          </p>
          <HuntingBotWaypointList
            waypoints={waypoints}
            selectedIndex={selectedIndex}
            runningIndex={running ? runningIndex : null}
            activeFloor={activeFloor}
            onSelect={setSelectedIndex}
            onHover={setHoveredIndex}
            onDelete={deleteWaypoint}
            onMove={(index, direction) =>
              setWaypoints((current) => {
                const target = index + direction;
                if (target < 0 || target >= current.length) return current;
                const moved = current[index];
                const other = current[target];
                if (!moved || !other) return current;
                return current.with(index, other).with(target, moved);
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
