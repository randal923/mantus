"use client";

import { useMemo, useState } from "react";
import type {
  BestiaryCreatureEntry,
  HuntingBotRoute,
  HuntingBotStopReason,
  Position,
  ServerErrorCode,
} from "@tibia/protocol";
import { useHuntingPlaces } from "../../hooks/useHuntingPlaces";
import type {
  HuntingPlace,
  HuntingTeamSize,
  HuntingVocation,
} from "../../lib/hunt-finder/HuntingPlace";
import {
  filterHuntingPlaces,
  type HuntingGuideSort,
} from "../../lib/hunt-finder/filterHuntingPlaces";
import { normalizeHuntName } from "../../lib/hunt-finder/normalizeHuntName";
import { baseHuntingVocation } from "../../lib/hunting-bot/baseHuntingVocation";
import { guideRouteFor } from "../../lib/hunting-bot/guideRouteFor";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { HuntFinderFilters } from "../hunt-finder/HuntFinderFilters";
import { HuntingPlaceCard } from "../hunt-finder/HuntingPlaceCard";
import { Modal } from "../ui/Modal";
import { HuntingBotRouteEditor } from "./HuntingBotRouteEditor";

interface HuntingBotModalProps {
  characterVocation: string;
  mapName: string;
  ownPosition: Position | null;
  creatures: ReadonlyArray<BestiaryCreatureEntry>;
  route: HuntingBotRoute;
  status: {
    readonly enabled: boolean;
    readonly waypointIndex: number;
    readonly stopReason: HuntingBotStopReason | null;
  } | null;
  error: ServerErrorCode | null;
  onRouteChange: (route: HuntingBotRoute) => void;
  onStart: () => void;
  onStop: () => void;
  onClose: () => void;
}

/**
 * Picks the hunting ground the bot walks. The browsing half deliberately
 * mirrors the Hunt Finder — same filters, same cards — because it is the same
 * catalog; choosing one opens its route in the editor.
 */
export function HuntingBotModal({
  characterVocation,
  mapName,
  ownPosition,
  creatures,
  route,
  status,
  error,
  onRouteChange,
  onStart,
  onStop,
  onClose,
}: HuntingBotModalProps) {
  const { t } = useAppTranslation();
  const catalog = useHuntingPlaces();
  const [level, setLevel] = useState("");
  const [vocation, setVocation] = useState<HuntingVocation | "all">(() =>
    baseHuntingVocation(characterVocation),
  );
  const [teamSize, setTeamSize] = useState<HuntingTeamSize | "all">("Solo");
  const [sort, setSort] = useState<HuntingGuideSort>("balanced");
  const [search, setSearch] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(
    () => (route.waypoints.length > 0 ? route.huntName : null) || null,
  );

  const places = useMemo(
    () =>
      filterHuntingPlaces(catalog.places, {
        characterLevel: level ? Number(level) : null,
        vocation,
        teamSize,
        sort,
        search,
      }),
    [catalog.places, level, search, sort, teamSize, vocation],
  );
  const creaturesByName = useMemo(
    () =>
      new Map(
        creatures.map((creature) => [
          normalizeHuntName(creature.name),
          creature,
        ]),
      ),
    [creatures],
  );
  const selectedPlace = useMemo<HuntingPlace | null>(
    () =>
      catalog.places.find((place) => place.Name === selectedName) ?? null,
    [catalog.places, selectedName],
  );

  // Opening a hunt the saved route is not for seeds it from the guide's own
  // hunt-route waypoints, kept as drawn: the bot pathfinds to each one as a
  // destination, so no tracing happens unless the player asks for it.
  const selectPlace = (place: HuntingPlace): void => {
    setSelectedName(place.Name);
    if (route.huntName === place.Name && route.waypoints.length > 0) return;
    const { waypoints } = guideRouteFor(place, ownPosition?.z ?? null);
    onRouteChange({ huntName: place.Name, waypoints });
  };

  return (
    <Modal size="full" title={t("huntingBot.title")} onClose={onClose}>
      <div className="flex min-h-full min-w-0 flex-col gap-4">
        {selectedPlace && (
          <HuntingBotRouteEditor
            place={selectedPlace}
            mapName={mapName}
            route={route}
            status={status}
            error={error}
            ownPosition={ownPosition}
            onRouteChange={onRouteChange}
            onStart={onStart}
            onStop={onStop}
            onBack={() => setSelectedName(null)}
          />
        )}
        {!selectedPlace && (
          <>
            <p className="text-sm text-ui-muted">{t("huntingBot.intro")}</p>
            <HuntFinderFilters
              level={level}
              vocation={vocation}
              teamSize={teamSize}
              sort={sort}
              search={search}
              onLevelChange={setLevel}
              onVocationChange={setVocation}
              onTeamSizeChange={setTeamSize}
              onSortChange={setSort}
              onSearchChange={setSearch}
            />
            <p className="text-xs tracking-widest text-ui-muted uppercase">
              {t("huntingBot.selectHunt")}
            </p>
            {catalog.pending && (
              <p role="status" className="py-16 text-center text-ui-muted">
                {t("huntFinder.loading")}
              </p>
            )}
            {catalog.error && (
              <p role="alert" className="py-16 text-center text-red-300">
                {t("huntFinder.error")}
              </p>
            )}
            {!catalog.pending && !catalog.error && places.length > 0 && (
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {places.map((place) => (
                  <HuntingPlaceCard
                    key={place.Name}
                    place={place}
                    creaturesByName={creaturesByName}
                    onSelect={() => selectPlace(place)}
                  />
                ))}
              </div>
            )}
            {!catalog.pending && !catalog.error && places.length === 0 && (
              <p className="py-16 text-center text-ui-muted">
                {t("huntFinder.empty")}
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
