"use client";

import { useState } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useHuntingPlaces } from "../../hooks/useHuntingPlaces";
import { huntingSpots } from "../../lib/hunt-finder/huntingSpots";
import { HuntRouteMap } from "../hunt-finder/HuntRouteMap";
import { Button } from "../ui/Button";

const MAP_NAME = "otservbr";
const FEATURED_PLACE = "Ferumbras Way";

/**
 * The Hunt Finder's "How To Get There" section, live and clickable: the real
 * route map with its floor switcher, plus the way-there / hunt-route toggle.
 */
export function LandingNewsHuntFinderShowcase() {
  const { t } = useAppTranslation();
  const { places } = useHuntingPlaces();
  const [routeView, setRouteView] = useState<"way" | "route">("way");
  const place = places.find((candidate) => candidate.Name === FEATURED_PLACE);
  if (!place) return null;
  const spot = huntingSpots(place)[0];
  const path =
    routeView === "way" ? (spot?.WayPath ?? place.WayPath) : (spot?.RoutePath ?? place.RoutePath);

  return (
    <section className="ui-panel-inset rounded-sm border border-ui-stone-light/15 bg-black/20 p-3 font-tibia">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h5 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
          {routeView === "way"
            ? t("huntFinder.map.howToGetThere")
            : t("huntFinder.map.huntingRoute")}
        </h5>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={routeView === "way" ? "primary" : "secondary"}
            onClick={() => setRouteView("way")}
          >
            {t("huntFinder.map.way")}
          </Button>
          <Button
            size="sm"
            variant={routeView === "route" ? "primary" : "secondary"}
            onClick={() => setRouteView("route")}
          >
            {t("huntFinder.map.route")}
          </Button>
        </div>
      </div>
      <HuntRouteMap
        key={`${place.Name}:${routeView}`}
        mapName={MAP_NAME}
        name={place.Name}
        path={path}
        isolate={routeView === "route"}
      />
      <p className="mt-3 text-xs text-ui-muted">
        <span className="font-bold text-ui-text">
          {t("huntFinder.requirements")}:
        </span>{" "}
        {place.RouteRequirements || t("huntFinder.none")}
      </p>
    </section>
  );
}
