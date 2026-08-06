import type {
  HuntingMonster,
  HuntingPath,
  HuntingPlace,
  HuntingPosition,
  HuntingTeamSize,
  HuntingVocation,
} from "./HuntingPlace";

const MAX_HUNTING_PLACES = 500;
const MAX_STRING_LENGTH = 2_000;
const HUNTING_VOCATIONS = new Set<HuntingVocation>([
  "Druid",
  "Knight",
  "Monk",
  "Paladin",
  "Sorcerer",
]);
const HUNTING_TEAM_SIZES = new Set<HuntingTeamSize>([
  "Solo",
  "Duo",
  "Party x4",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_STRING_LENGTH;
}

function isStringArray(value: unknown): value is ReadonlyArray<string> {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every(isBoundedString)
  );
}

function isPosition(value: unknown): value is HuntingPosition {
  return (
    isRecord(value) &&
    Number.isInteger(value.x) &&
    Number.isInteger(value.y) &&
    Number.isInteger(value.z) &&
    Number(value.x) >= 0 &&
    Number(value.x) <= 65_535 &&
    Number(value.y) >= 0 &&
    Number(value.y) <= 65_535 &&
    Number(value.z) >= 0 &&
    Number(value.z) <= 15
  );
}

function isPath(value: unknown): value is HuntingPath {
  if (
    !isRecord(value) ||
    !isRecord(value.Coordinates) ||
    !isStringArray(value.Paths)
  ) {
    return false;
  }
  if (
    value.Position !== undefined &&
    !isPosition(value.Position)
  ) {
    return false;
  }
  if (
    value.TemplePosition !== undefined &&
    !isPosition(value.TemplePosition)
  ) {
    return false;
  }
  return Object.entries(value.Coordinates).every(
    ([floor, segments]) =>
      /^\d{1,2}$/.test(floor) &&
      Array.isArray(segments) &&
      segments.length <= 1_000 &&
      segments.every(
        (segment) =>
          Array.isArray(segment) &&
          segment.length === 2 &&
          segment.every(isPosition),
      ),
  );
}

function isStringArrayRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).length <= 10 &&
    Object.entries(value).every(
      ([label, entries]) =>
        label.length > 0 && label.length <= 50 && isStringArray(entries),
    )
  );
}

function isEquipmentRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).length <= HUNTING_VOCATIONS.size &&
    Object.entries(value).every(
      ([vocation, equipment]) =>
        HUNTING_VOCATIONS.has(vocation as HuntingVocation) &&
        isRecord(equipment) &&
        Object.keys(equipment).length <= 20 &&
        Object.values(equipment).every(isBoundedString),
    )
  );
}

function isMonster(value: unknown): value is HuntingMonster {
  return (
    isRecord(value) &&
    isBoundedString(value.Name) &&
    value.Name.length > 0 &&
    (value.Resistances === undefined || isBoundedString(value.Resistances)) &&
    (value.Charm === undefined || isBoundedString(value.Charm))
  );
}

function isHuntingPlace(value: unknown): value is HuntingPlace {
  return (
    isRecord(value) &&
    isBoundedString(value.Name) &&
    value.Name.length > 0 &&
    isBoundedString(value.Level) &&
    Array.isArray(value.Type) &&
    value.Type.length > 0 &&
    value.Type.every((teamSize) =>
      HUNTING_TEAM_SIZES.has(teamSize as HuntingTeamSize),
    ) &&
    isBoundedString(value["Xp/Hour"]) &&
    isBoundedString(value["Loot/Hour"]) &&
    isBoundedString(value.Location) &&
    Array.isArray(value.Vocation) &&
    value.Vocation.length > 0 &&
    value.Vocation.every((vocation) =>
      HUNTING_VOCATIONS.has(vocation as HuntingVocation),
    ) &&
    typeof value.PremiumRequired === "boolean" &&
    (value.New === undefined || typeof value.New === "boolean") &&
    (value.Generated === undefined || typeof value.Generated === "boolean") &&
    isBoundedString(value.RouteRequirements) &&
    isStringArrayRecord(value.RecommendedImbues) &&
    isStringArrayRecord(value.RecommendedSupplies) &&
    isStringArray(value.ValuableDrops) &&
    Array.isArray(value.Monsters) &&
    value.Monsters.length > 0 &&
    value.Monsters.length <= 50 &&
    value.Monsters.every(isMonster) &&
    isPath(value.WayPath) &&
    isPath(value.RoutePath) &&
    isEquipmentRecord(value.Equipments)
  );
}

export function parseHuntingPlaces(
  value: unknown,
): ReadonlyArray<HuntingPlace> {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_HUNTING_PLACES) {
    throw new Error("invalid hunting place catalog");
  }
  const invalidIndex = value.findIndex((place) => !isHuntingPlace(place));
  if (invalidIndex >= 0) {
    throw new Error(`invalid hunting place catalog at index ${invalidIndex}`);
  }
  return value;
}
