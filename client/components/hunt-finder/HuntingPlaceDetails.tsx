"use client";

import { useState } from "react";
import type { BestiaryCreatureEntry } from "@tibia/protocol";
import type {
  HuntingPath,
  HuntingPlace,
  HuntingSpot,
  HuntingVocation,
} from "../../lib/hunt-finder/HuntingPlace";
import type { WikiItem } from "../../lib/wiki/WikiItem";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { HuntEquipmentGrid } from "./HuntEquipmentGrid";
import { HuntItemTile } from "./HuntItemTile";
import { HuntMonsterSprite } from "./HuntMonsterSprite";
import { HuntRouteMap } from "./HuntRouteMap";
import { HuntSpotMap } from "./HuntSpotMap";

type RouteView = "way" | "route";

interface HuntingPlaceDetailsProps {
  place: HuntingPlace;
  vocation: HuntingVocation;
  mapName: string;
  itemsByName: ReadonlyMap<string, WikiItem>;
  creaturesByName: ReadonlyMap<string, BestiaryCreatureEntry>;
  spots: ReadonlyArray<HuntingSpot>;
  /** The cave being read; the live map tracks this one when tracking is on. */
  spot: HuntingSpot | undefined;
  onSelectSpot: (spot: HuntingSpot) => void;
  onBack: () => void;
}

export function HuntingPlaceDetails({
  place,
  vocation,
  mapName,
  itemsByName,
  creaturesByName,
  spots,
  spot,
  onSelectSpot,
  onBack,
}: HuntingPlaceDetailsProps) {
  const { t } = useAppTranslation();
  const [routeView, setRouteView] = useState<RouteView>("way");
  const path: HuntingPath =
    routeView === "way" ? (spot?.WayPath ?? place.WayPath) : (spot?.RoutePath ?? place.RoutePath);
  const imbues =
    place.RecommendedImbues[vocation] ??
    (["Druid", "Sorcerer"].includes(vocation)
      ? (place.RecommendedImbues.Mages ?? [])
      : []);
  const supplies = place.RecommendedSupplies[vocation] ?? [];
  const equipment = place.Equipments[vocation] ?? {};
  const routeNotes = path.Paths.filter((note) => note.trim().length > 0);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={onBack}>
          ← {t("huntFinder.back")}
        </Button>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-center font-display text-lg font-bold tracking-wide text-ui-text-bright sm:text-xl">
            {place.Name}
          </h3>
          <p className="text-center text-xs tracking-widest text-ui-muted uppercase">
            {place.Type.join(" · ")} · {place.Vocation.join(" · ")}
          </p>
        </div>
        {place.Generated && (
          <span className="rounded-sm border border-ui-stone-light/30 bg-black/40 px-2 py-1 text-xs font-bold tracking-wide text-ui-muted uppercase">
            {t("huntFinder.generated")}
          </span>
        )}
        <span
          className={`rounded-sm border px-2 py-1 text-xs font-bold tracking-wide uppercase ${
            place.PremiumRequired
              ? "border-ui-gold/35 bg-ui-gold/10 text-ui-gold"
              : "border-ui-success/35 bg-ui-success/10 text-ui-success"
          }`}
        >
          {place.PremiumRequired
            ? t("huntFinder.premium")
            : t("huntFinder.freeAccount")}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [t("huntFinder.level"), `${place.Level}+`, "text-ui-text-bright"],
          [t("huntFinder.experience"), place["Xp/Hour"], "text-fuchsia-300"],
          [t("huntFinder.loot"), place["Loot/Hour"], "text-amber-300"],
          [t("huntFinder.location"), place.Location, "text-cyan-200"],
        ].map(([label, value, color]) => (
          <div
            key={label}
            className="ui-panel-inset rounded-sm border border-ui-stone-light/15 bg-black/25 px-3 py-2 text-center"
          >
            <dt className="text-[10px] tracking-widest text-ui-muted uppercase">
              {label}
            </dt>
            <dd className={`mt-0.5 font-display text-base font-bold ${color}`}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[1.05fr_1.35fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="ui-panel-inset rounded-sm border border-ui-stone-light/15 bg-black/20 p-3">
            <h4 className="mb-3 font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
              {t("huntFinder.creatures")}
            </h4>
            <div className="flex flex-col gap-2">
              {place.Monsters.map((monster) => (
                <article
                  key={monster.Name}
                  className="flex min-w-0 items-center gap-3 rounded-sm border border-ui-stone-light/10 bg-black/25 p-2"
                >
                  <span className="flex size-16 shrink-0 items-center justify-center">
                    <HuntMonsterSprite
                      name={monster.Name}
                      creaturesByName={creaturesByName}
                      fit={64}
                    />
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-sm text-ui-text-bright">
                      {monster.Name}
                    </strong>
                    {monster.Resistances && (
                      <span className="mt-1 block text-xs leading-5 text-ui-muted">
                        {monster.Resistances}
                      </span>
                    )}
                    {monster.Charm && (
                      <span className="mt-1 inline-block rounded-sm border border-fuchsia-400/25 bg-fuchsia-400/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-fuchsia-200 uppercase">
                        {t("huntFinder.charm", { charm: monster.Charm })}
                      </span>
                    )}
                  </span>
                </article>
              ))}
            </div>
          </section>

          <section className="ui-panel-inset rounded-sm border border-ui-stone-light/15 bg-black/20 p-3">
            <h4 className="mb-3 font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
              {t("huntFinder.recommendedImbues")}
            </h4>
            <div className="flex flex-wrap gap-2">
              {imbues.map((imbue) => (
                <span
                  key={imbue}
                  className="rounded-sm border border-fuchsia-400/25 bg-fuchsia-400/10 px-3 py-1.5 text-xs font-bold text-fuchsia-200"
                >
                  {imbue}
                </span>
              ))}
            </div>
          </section>

          <section className="ui-panel-inset rounded-sm border border-ui-stone-light/15 bg-black/20 p-3">
            <h4 className="mb-3 font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
              {t("huntFinder.equipment", { vocation })}
            </h4>
            <HuntEquipmentGrid
              equipment={equipment}
              itemsByName={itemsByName}
            />
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section className="ui-panel-inset rounded-sm border border-ui-stone-light/15 bg-black/20 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
                {routeView === "way"
                  ? t("huntFinder.map.howToGetThere")
                  : t("huntFinder.map.huntingRoute")}
              </h4>
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
            {spots.length > 1 && (
              <div className="mb-3 flex h-80 flex-col">
                <HuntSpotMap
                  mapName={mapName}
                  spots={spots}
                  selectedName={spot?.Name ?? null}
                  onSelect={onSelectSpot}
                />
              </div>
            )}
            <HuntRouteMap
              key={`${place.Name}:${spot?.Name ?? ""}:${routeView}`}
              mapName={mapName}
              name={spots.length > 1 ? `${place.Name} — ${spot?.Name ?? ""}` : place.Name}
              path={path}
              isolate={routeView === "route"}
            />
            {routeNotes.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-ui-text/80">
                {routeNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-ui-muted">
              <span className="font-bold text-ui-text">
                {t("huntFinder.requirements")}:
              </span>{" "}
              {place.RouteRequirements || t("huntFinder.none")}
            </p>
          </section>

          <section className="ui-panel-inset rounded-sm border border-ui-stone-light/15 bg-black/20 p-3">
            <h4 className="mb-3 font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
              {t("huntFinder.recommendedSupplies")}
            </h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {supplies.map((name) => (
                <HuntItemTile
                  key={name}
                  name={name}
                  itemsByName={itemsByName}
                />
              ))}
            </div>
          </section>

          <section className="ui-panel-inset rounded-sm border border-ui-stone-light/15 bg-black/20 p-3">
            <h4 className="mb-3 font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
              {t("huntFinder.valuableDrops")}
            </h4>
            {place.ValuableDrops.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {place.ValuableDrops.map((name) => (
                  <HuntItemTile
                    key={name}
                    name={name}
                    itemsByName={itemsByName}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-ui-muted">{t("huntFinder.none")}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
