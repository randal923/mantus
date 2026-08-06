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
  HuntingSpot,
  HuntingTeamSize,
  HuntingVocation,
} from "../../lib/hunt-finder/HuntingPlace";
import { huntingSpots } from "../../lib/hunt-finder/huntingSpots";
import {
  filterHuntingPlaces,
  type HuntingGuideSort,
} from "../../lib/hunt-finder/filterHuntingPlaces";
import { normalizeHuntName } from "../../lib/hunt-finder/normalizeHuntName";
import { baseHuntingVocation } from "../../lib/hunting-bot/baseHuntingVocation";
import { guideRouteFor } from "../../lib/hunting-bot/guideRouteFor";
import { huntRouteName } from "../../lib/hunting-bot/huntRouteName";
import { parseHuntRouteName } from "../../lib/hunting-bot/parseHuntRouteName";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { HuntFinderFilters } from "../hunt-finder/HuntFinderFilters";
import { HuntingPlaceCard } from "../hunt-finder/HuntingPlaceCard";
import { HuntSpotMap } from "../hunt-finder/HuntSpotMap";
import { Button } from "../ui/Button";
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
  const saved = parseHuntRouteName(route.huntName);
  const [selectedName, setSelectedName] = useState<string | null>(
    () => (route.waypoints.length > 0 ? saved.placeName : null) || null,
  );
  const [selectedSpotName, setSelectedSpotName] = useState<string | null>(
    () => (route.waypoints.length > 0 ? saved.spotName : null),
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
  const spots = useMemo(
    () => (selectedPlace ? huntingSpots(selectedPlace) : []),
    [selectedPlace],
  );
  const selectedSpot =
    spots.find((spot) => spot.Name === selectedSpotName) ??
    (spots.length === 1 ? spots[0] : null);

  // Opening a hunt the saved route is not for seeds it from the guide's own
  // hunt-route waypoints, kept as drawn: the bot pathfinds to each one as a
  // destination, so no tracing happens unless the player asks for it.
  const selectSpot = (place: HuntingPlace, spot: HuntingSpot): void => {
    setSelectedName(place.Name);
    setSelectedSpotName(spot.Name);
    const huntName = huntRouteName(place.Name, spot.Name);
    if (route.huntName === huntName && route.waypoints.length > 0) return;
    const { waypoints } = guideRouteFor(spot, ownPosition?.z ?? null);
    onRouteChange({ huntName, waypoints });
  };

  // A hunt with several caves asks which one first: they share creatures and
  // gear but not a way in, so the choice is a place on the map.
  const selectPlace = (place: HuntingPlace): void => {
    const places = huntingSpots(place);
    if (places.length > 1) {
      setSelectedName(place.Name);
      setSelectedSpotName(null);
      return;
    }
    selectSpot(place, places[0]);
  };

  return (
    <Modal size="full" title={t("huntingBot.title")} onClose={onClose}>
      <div className="flex min-h-full min-w-0 flex-col gap-4">
        {selectedPlace && selectedSpot && (
          <HuntingBotRouteEditor
            place={selectedPlace}
            spot={selectedSpot}
            mapName={mapName}
            route={route}
            status={status}
            error={error}
            ownPosition={ownPosition}
            onRouteChange={onRouteChange}
            onStart={onStart}
            onStop={onStop}
            onBack={() => {
              if (spots.length > 1) {
                setSelectedSpotName(null);
                return;
              }
              setSelectedName(null);
            }}
          />
        )}
        {selectedPlace && !selectedSpot && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={() => setSelectedName(null)}>
                ← {t("huntFinder.back")}
              </Button>
              <h3 className="min-w-0 flex-1 truncate font-display text-lg font-bold tracking-wide text-ui-text-bright">
                {selectedPlace.Name}
              </h3>
            </div>
            <p className="text-sm text-ui-muted">
              {t("huntingBot.selectSpot")}
            </p>
            <div className="flex min-h-0 flex-1 flex-col">
              <HuntSpotMap
                mapName={mapName}
                spots={spots}
                selectedName={null}
                onSelect={(spot) => selectSpot(selectedPlace, spot)}
              />
            </div>
          </div>
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
