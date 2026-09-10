import { DEFAULT_STARTER_TOWN } from "./defaultStarterTown";

interface TownLookup {
  townId(townName: string): number | undefined;
}

/**
 * The home town written to every new character: the configured
 * `characters.starterTownId` when set, else the loaded map's town named
 * `DEFAULT_STARTER_TOWN` (Thais).
 */
export function resolveStarterTownId(
  configured: number | undefined,
  towns: TownLookup,
): number {
  if (configured !== undefined) return configured;
  const townId = towns.townId(DEFAULT_STARTER_TOWN);
  if (townId === undefined) {
    throw new Error(
      `characters.starterTownId is unset and the loaded map has no town named ${DEFAULT_STARTER_TOWN}`,
    );
  }
  return townId;
}
