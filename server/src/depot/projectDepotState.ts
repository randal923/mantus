import {
  DEPOT_LIMITS,
  type DepotEntry,
  type DepotLocation,
  type DepotStateMessage,
} from "@tibia/protocol";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { DepotPage } from "./DepotStore";
import type { StorageAccess } from "./StorageAccess";

export function projectDepotState(
  items: ItemIntentHandler,
  access: Extract<StorageAccess, { kind: "depot" }>,
  location: DepotLocation,
  query: string,
  page: number,
  result: DepotPage,
): DepotStateMessage {
  const entries: DepotEntry[] = result.entries.map((entry) => {
    const type = items.itemType(
      entry.location === "stash" ? entry.itemTypeId : entry.item.typeId,
    );
    if (!type) throw new Error("depot contains an unknown item type");
    if (entry.location === "stash") {
      return {
        location: "stash",
        itemTypeId: type.id,
        clientId: type.clientId,
        spriteId: type.spriteId,
        name: type.name,
        stackable: type.stackable,
        maxCount: type.maxCount,
        weight: type.weight,
        ...(type.stowable ? { stowable: true } : {}),
        count: entry.count,
      };
    }
    return {
      location: entry.location,
      slot: entry.slot,
      itemId: entry.item.id,
      itemTypeId: type.id,
      clientId: type.clientId,
      spriteId: type.spriteId,
      name: type.name,
      stackable: type.stackable,
      maxCount: type.maxCount,
      weight: type.weight,
      ...(type.stowable &&
      type.containerCapacity === undefined &&
      Object.keys(entry.item.attributes).length === 0
        ? { stowable: true }
        : {}),
      count: entry.item.count,
      revision: entry.item.version,
      containedItemCount: entry.containedItemCount,
    };
  });
  return {
    type: "depot-state",
    sessionId: access.sessionId,
    depotId: access.depotId,
    townName: access.townName,
    depotRevision: result.snapshot.depotRevision,
    inboxRevision: result.snapshot.inboxRevision,
    stashRevision: result.snapshot.stashRevision,
    depotCount: result.snapshot.depotCount,
    inboxCount: result.snapshot.inboxCount,
    stashCount: result.snapshot.stashCount,
    depotCapacity: DEPOT_LIMITS.maxDepotItems,
    inboxCapacity: DEPOT_LIMITS.maxInboxItems,
    location,
    query,
    page,
    pageCount: Math.max(
      1,
      Math.ceil(result.totalEntries / DEPOT_LIMITS.pageSize),
    ),
    entries,
  };
}
