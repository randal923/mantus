import {
  HOUSE_LIMITS,
  type HouseState,
  type HousePendingTransfer,
} from "@tibia/protocol";
import type { HouseInfo } from "./HouseInfo";
import type { HouseSnapshot } from "./HouseStore";

/**
 * Viewer-scoped house projection. Metadata and the owner's display name are
 * public; access lists go only to the owner and subowners, and rent state
 * plus the pending transfer only to the owner (charter rule 6).
 */
export function projectHouseStateFor(input: {
  info: HouseInfo;
  snapshot: HouseSnapshot | undefined;
  viewerCharacterId: string;
  townName?: string;
  pendingTransfer?: HousePendingTransfer;
}): HouseState {
  const { info, snapshot, viewerCharacterId } = input;
  const myAccess = snapshot
    ? snapshot.ownerCharacterId === viewerCharacterId
      ? "owner"
      : snapshot.subowners.some(
            (entry) => entry.characterId === viewerCharacterId,
          )
        ? "subowner"
        : snapshot.guests.some(
              (entry) => entry.characterId === viewerCharacterId,
            )
          ? "guest"
          : "none"
    : "none";
  const seesLists = myAccess === "owner" || myAccess === "subowner";
  return {
    houseId: info.houseId,
    name: info.name,
    size: info.size,
    rent: info.rent,
    townId: info.townId,
    ...(input.townName ? { townName: input.townName } : {}),
    entry: info.entry,
    guildhall: info.guildhall,
    beds: info.beds,
    price: info.size * HOUSE_LIMITS.pricePerSqm,
    ownerName: snapshot?.ownerName ?? null,
    myAccess,
    ...(snapshot && myAccess === "owner"
      ? {
          paidUntil: snapshot.paidUntilMs,
          rentWarnings: snapshot.rentWarnings,
          ...(input.pendingTransfer
            ? { pendingTransfer: input.pendingTransfer }
            : {}),
        }
      : {}),
    ...(snapshot && seesLists
      ? {
          guests: snapshot.guests.map((entry) => ({ ...entry })),
          subowners: snapshot.subowners.map((entry) => ({ ...entry })),
        }
      : {}),
  };
}
