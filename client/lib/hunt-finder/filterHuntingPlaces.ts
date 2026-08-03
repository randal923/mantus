import type {
  HuntingPlace,
  HuntingTeamSize,
  HuntingVocation,
} from "./HuntingPlace";
import { normalizeHuntName } from "./normalizeHuntName";
import { parseHuntMetric } from "./parseHuntMetric";

export type HuntingGuideSort = "balanced" | "experience" | "loot";

export interface HuntingPlaceFilters {
  /** Hunts requiring a higher level are hidden; null keeps every hunt. */
  readonly characterLevel: number | null;
  readonly vocation: HuntingVocation | "all";
  readonly teamSize: HuntingTeamSize | "all";
  readonly sort: HuntingGuideSort;
  readonly search: string;
}

function score(place: HuntingPlace, sort: HuntingGuideSort): number {
  const experience = parseHuntMetric(place["Xp/Hour"]);
  const loot = parseHuntMetric(place["Loot/Hour"]);
  if (sort === "experience") return experience;
  if (sort === "loot") return loot;
  return Math.sqrt((experience + 1) * (loot + 1));
}

export function filterHuntingPlaces(
  places: ReadonlyArray<HuntingPlace>,
  filters: HuntingPlaceFilters,
): ReadonlyArray<HuntingPlace> {
  const query = normalizeHuntName(filters.search);
  return places
    .filter(
      (place) =>
        filters.characterLevel === null ||
        Number(place.Level) <= filters.characterLevel,
    )
    .filter(
      (place) =>
        filters.vocation === "all" ||
        place.Vocation.includes(filters.vocation),
    )
    .filter(
      (place) =>
        filters.teamSize === "all" || place.Type.includes(filters.teamSize),
    )
    .filter((place) => {
      if (!query) return true;
      return normalizeHuntName(
        [
          place.Name,
          place.Location,
          ...place.Monsters.map((monster) => monster.Name),
        ].join(" "),
      ).includes(query);
    })
    .toSorted((left, right) => {
      const difference = score(right, filters.sort) - score(left, filters.sort);
      return difference || Number(left.Level) - Number(right.Level);
    });
}
