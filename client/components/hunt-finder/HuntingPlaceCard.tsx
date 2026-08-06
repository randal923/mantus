"use client";

import type { BestiaryCreatureEntry } from "@tibia/protocol";
import type { HuntingPlace } from "../../lib/hunt-finder/HuntingPlace";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { LazyMount } from "../bestiary/LazyMount";
import { HuntMonsterSprite } from "./HuntMonsterSprite";

interface HuntingPlaceCardProps {
  place: HuntingPlace;
  creaturesByName: ReadonlyMap<string, BestiaryCreatureEntry>;
  onSelect: () => void;
}

export function HuntingPlaceCard({
  place,
  creaturesByName,
  onSelect,
}: HuntingPlaceCardProps) {
  const { t } = useAppTranslation();
  return (
    <button
      type="button"
      onClick={onSelect}
      className="ui-panel-inset group relative flex min-h-64 min-w-0 flex-col overflow-hidden rounded-sm border border-ui-stone-light/20 bg-black/25 text-left transition-[border-color,transform] hover:-translate-y-0.5 hover:border-ui-gold/55 focus-visible:border-ui-gold focus-visible:outline-none"
    >
      {place.New && (
        <span className="absolute mt-2 ml-2 rounded-sm border border-cyan-300/40 bg-cyan-950/90 px-2 py-0.5 text-[10px] font-bold tracking-widest text-cyan-200 uppercase">
          {t("huntFinder.new")}
        </span>
      )}
      {place.Generated && (
        <span className="absolute end-0 mt-2 me-2 rounded-sm border border-ui-stone-light/30 bg-black/70 px-2 py-0.5 text-[10px] font-bold tracking-widest text-ui-muted uppercase">
          {t("huntFinder.generated")}
        </span>
      )}
      <LazyMount
        placeholderHeight={128}
        className="flex h-32 w-full items-center justify-center gap-1 overflow-hidden bg-[radial-gradient(circle_at_center,rgba(151,118,62,0.16),transparent_65%)] px-3"
      >
        {place.Monsters.slice(0, 4).map((monster) => (
          <HuntMonsterSprite
            key={monster.Name}
            name={monster.Name}
            creaturesByName={creaturesByName}
            fit={76}
          />
        ))}
      </LazyMount>

      <h3 className="w-full truncate border-y border-ui-gold/20 bg-ui-gold/8 px-3 py-2 text-center font-display text-sm font-bold tracking-wide text-ui-text-bright group-hover:text-ui-gold">
        {place.Name}
      </h3>

      <dl className="grid w-full flex-1 grid-cols-2 gap-px bg-ui-stone-light/10">
        <div className="bg-ui-panel-deep/90 px-3 py-2">
          <dt className="text-[10px] tracking-widest text-ui-muted uppercase">
            {t("huntFinder.level")}
          </dt>
          <dd className="font-bold text-ui-text-bright">{place.Level}+</dd>
        </div>
        <div className="bg-ui-panel-deep/90 px-3 py-2">
          <dt className="text-[10px] tracking-widest text-ui-muted uppercase">
            {t("huntFinder.experience")}
          </dt>
          <dd className="font-bold text-fuchsia-300">{place["Xp/Hour"]}</dd>
        </div>
        <div className="bg-ui-panel-deep/90 px-3 py-2">
          <dt className="text-[10px] tracking-widest text-ui-muted uppercase">
            {t("huntFinder.loot")}
          </dt>
          <dd className="font-bold text-amber-300">{place["Loot/Hour"]}</dd>
        </div>
        <div className="min-w-0 bg-ui-panel-deep/90 px-3 py-2">
          <dt className="text-[10px] tracking-widest text-ui-muted uppercase">
            {t("huntFinder.location")}
          </dt>
          <dd className="truncate font-bold text-ui-text-bright">
            {place.Location}
          </dd>
        </div>
      </dl>
    </button>
  );
}
