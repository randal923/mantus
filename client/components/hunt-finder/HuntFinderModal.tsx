"use client";

import { useMemo, useState } from "react";
import type { BestiaryCreatureEntry } from "@tibia/protocol";
import { useHuntingPlaces } from "../../hooks/useHuntingPlaces";
import { useWikiItems } from "../../hooks/useWikiItems";
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
import type { MinimapRoute } from "../../lib/minimap/MinimapRoute";
import { useAppTranslation } from "../../i18n/useAppTranslation";
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
  const [minimumLevel, setMinimumLevel] = useState("");
  const [vocation, setVocation] = useState<HuntingVocation | "all">(
    () => baseVocation(characterVocation),
  );
  const [teamSize, setTeamSize] = useState<HuntingTeamSize | "all">("Solo");
  const [sort, setSort] = useState<HuntingGuideSort>("balanced");
  const [search, setSearch] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<HuntingPlace | null>(null);
  const places = useMemo(
    () =>
      filterHuntingPlaces(catalog.places, {
        minimumLevel: Number(minimumLevel),
        vocation,
        teamSize,
        sort,
        search,
      }),
    [catalog.places, minimumLevel, search, sort, teamSize, vocation],
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
  const selectedVocation =
    vocation !== "all" && selectedPlace?.Vocation.includes(vocation)
      ? vocation
      : (selectedPlace?.Vocation[0] ?? baseVocation(characterVocation));

  return (
    <Modal size="full" title={t("huntFinder.title")} onClose={onClose}>
      <div className="flex min-h-full min-w-0 flex-col gap-4">
        <HuntFinderFilters
          minimumLevel={minimumLevel}
          vocation={vocation}
          teamSize={teamSize}
          sort={sort}
          search={search}
          onMinimumLevelChange={setMinimumLevel}
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
            tracked={trackedRoute?.name === selectedPlace.Name}
            onTrackChange={(tracked) =>
              onTrackedRouteChange(
                tracked
                  ? {
                      name: selectedPlace.Name,
                      coordinates: selectedPlace.WayPath.Coordinates,
                      destination: selectedPlace.WayPath.Position,
                    }
                  : null,
              )
            }
            onBack={() => setSelectedPlace(null)}
          />
        )}
        {!catalog.pending && !catalog.error && !selectedPlace && (
          <>
            <p className="text-xs tracking-widest text-ui-muted uppercase">
              {t("huntFinder.results", { count: places.length })}
            </p>
            {places.length > 0 ? (
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {places.map((place) => (
                  <HuntingPlaceCard
                    key={place.Name}
                    place={place}
                    creaturesByName={creaturesByName}
                    onSelect={() => setSelectedPlace(place)}
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
