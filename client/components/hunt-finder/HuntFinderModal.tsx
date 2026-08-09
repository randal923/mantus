"use client";

import { useMemo, useState } from "react";
import type { BestiaryCreatureEntry } from "@tibia/protocol";
import { useHuntingPlaces } from "../../hooks/useHuntingPlaces";
import { useWikiItems } from "../../hooks/useWikiItems";
import type {
  HuntingPlace,
  HuntingSpot,
  HuntingTeamSize,
  HuntingVocation,
} from "../../lib/hunt-finder/HuntingPlace";
import {
  filterHuntingPlaces,
  type HuntingGuideSort,
} from "../../lib/hunt-finder/filterHuntingPlaces";
import { findTrackedPlace } from "../../lib/hunt-finder/findTrackedPlace";
import { huntingSpots } from "../../lib/hunt-finder/huntingSpots";
import { normalizeHuntName } from "../../lib/hunt-finder/normalizeHuntName";
import { trackedSpotRoute } from "../../lib/hunt-finder/trackedSpotRoute";
import type { MinimapRoute } from "../../lib/minimap/MinimapRoute";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { HuntFinderFilters } from "./HuntFinderFilters";
import { HuntingPlaceCard } from "./HuntingPlaceCard";
import { HuntingPlaceDetails } from "./HuntingPlaceDetails";

function baseVocation(vocation: string): HuntingVocation {
  if (vocation.includes("Knight")) return "Knight";
  if (vocation.includes("Paladin")) return "Paladin";
  if (vocation.includes("Sorcerer")) return "Sorcerer";
  if (vocation.includes("Druid")) return "Druid";
  return "Monk";
}

interface HuntFinderModalProps {
  characterVocation: string;
  mapName: string;
  creatures: ReadonlyArray<BestiaryCreatureEntry>;
  trackedRoute: MinimapRoute | null;
  onTrackedRouteChange: (route: MinimapRoute | null) => void;
  onClose: () => void;
}

export function HuntFinderModal({
  characterVocation,
  mapName,
  creatures,
  trackedRoute,
  onTrackedRouteChange,
  onClose,
}: HuntFinderModalProps) {
  const { t } = useAppTranslation();
  const catalog = useHuntingPlaces();
  const wikiItems = useWikiItems();
  const [level, setLevel] = useState("");
  const [vocation, setVocation] = useState<HuntingVocation | "all">(
    () => baseVocation(characterVocation),
  );
  const [teamSize, setTeamSize] = useState<HuntingTeamSize | "all">("Solo");
  const [sort, setSort] = useState<HuntingGuideSort>("balanced");
  const [search, setSearch] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<HuntingPlace | null>(null);
  const [spotName, setSpotName] = useState<string | null>(null);
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
  const itemsByName = useMemo(
    () =>
      new Map(
        wikiItems.items.map((item) => [normalizeHuntName(item.name), item]),
      ),
    [wikiItems.items],
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
  const trackedPlace = useMemo(
    () => findTrackedPlace(catalog.places, trackedRoute?.name ?? null),
    [catalog.places, trackedRoute],
  );
  const untrackedPlaces = trackedPlace
    ? places.filter((place) => place.Name !== trackedPlace.Name)
    : places;
  const selectedVocation =
    vocation !== "all" && selectedPlace?.Vocation.includes(vocation)
      ? vocation
      : (selectedPlace?.Vocation[0] ?? baseVocation(characterVocation));
  const spots = useMemo(
    () => (selectedPlace ? huntingSpots(selectedPlace) : []),
    [selectedPlace],
  );
  const spot = spots.find((candidate) => candidate.Name === spotName) ?? spots[0];
  const tracked =
    selectedPlace !== null &&
    spot !== undefined &&
    trackedRoute?.name === trackedSpotRoute(selectedPlace, spot).name;

  const openPlace = (place: HuntingPlace | null): void => {
    setSelectedPlace(place);
    setSpotName(null);
  };
  // Switching cave while the live map follows this hunt moves the drawn path
  // with it: tracking is "show me the way to what I am reading".
  const selectSpot = (picked: HuntingSpot): void => {
    setSpotName(picked.Name);
    if (tracked && selectedPlace) {
      onTrackedRouteChange(trackedSpotRoute(selectedPlace, picked));
    }
  };

  return (
    <Modal size="full" title={t("huntFinder.title")} onClose={onClose}>
      <div className="flex min-h-full min-w-0 flex-col gap-4">
        {selectedPlace && (
          <Button
            size="sm"
            variant={tracked ? "primary" : "secondary"}
            aria-pressed={tracked}
            className="self-end"
            onClick={() =>
              onTrackedRouteChange(
                !tracked && spot
                  ? trackedSpotRoute(selectedPlace, spot)
                  : null,
              )
            }
          >
            {tracked
              ? t("huntFinder.stopTracking")
              : t("huntFinder.trackOnMap")}
          </Button>
        )}
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
        {!catalog.pending && !catalog.error && selectedPlace && (
          <HuntingPlaceDetails
            place={selectedPlace}
            vocation={selectedVocation}
            mapName={mapName}
            itemsByName={itemsByName}
            creaturesByName={creaturesByName}
            spots={spots}
            spot={spot}
            onSelectSpot={selectSpot}
            onBack={() => openPlace(null)}
          />
        )}
        {!catalog.pending && !catalog.error && !selectedPlace && (
          <>
            {trackedPlace && (
              <section className="flex min-w-0 flex-col gap-3">
                <p className="text-xs tracking-widest text-cyan-200 uppercase">
                  {t("huntFinder.tracking")}
                </p>
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  <HuntingPlaceCard
                    place={trackedPlace}
                    creaturesByName={creaturesByName}
                    onSelect={() => openPlace(trackedPlace)}
                  />
                </div>
              </section>
            )}
            <p className="text-xs tracking-widest text-ui-muted uppercase">
              {t("huntFinder.results", { count: untrackedPlaces.length })}
            </p>
            {untrackedPlaces.length > 0 ? (
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {untrackedPlaces.map((place) => (
                  <HuntingPlaceCard
                    key={place.Name}
                    place={place}
                    creaturesByName={creaturesByName}
                    onSelect={() => openPlace(place)}
                  />
                ))}
              </div>
            ) : (
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
