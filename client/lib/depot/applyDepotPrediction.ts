import type {
  DepotItemEntry,
  DepotStateMessage,
  StashEntry,
} from "@tibia/protocol";
import type { DepotPrediction } from "./DepotPrediction";

interface OptimisticDepotItemEntry extends DepotItemEntry {
  readonly optimistic: true;
}

interface OptimisticStashEntry extends StashEntry {
  readonly optimistic: true;
}

function matchesQuery(name: string, query: string): boolean {
  return name.toLowerCase().includes(query.trim().toLowerCase());
}

export function applyDepotPrediction(
  state: DepotStateMessage,
  prediction: DepotPrediction,
): DepotStateMessage {
  if (prediction.kind === "deposit") {
    const item = prediction.item;
    const entry: OptimisticDepotItemEntry = {
      location: "depot",
      slot: 0,
      itemId: item.id,
      itemTypeId: item.typeId,
      clientId: item.clientId,
      spriteId: item.spriteId,
      name: item.name,
      stackable: item.stackable,
      maxCount: item.maxCount,
      weight: item.tooltip.weight,
      ...(item.stowable ? { stowable: true } : {}),
      count: item.count,
      revision: item.revision + 1,
      containedItemCount: 0,
      optimistic: true,
    };
    const showEntry =
      state.location === "depot" &&
      state.page === 1 &&
      matchesQuery(item.name, state.query);
    return {
      ...state,
      depotCount: Math.min(state.depotCapacity, state.depotCount + 1),
      entries: showEntry ? [...state.entries, entry] : state.entries,
    };
  }
  if (prediction.kind === "withdraw") {
    const removedCount = prediction.item.containedItemCount + 1;
    return {
      ...state,
      depotCount:
        prediction.item.location === "depot"
          ? Math.max(0, state.depotCount - removedCount)
          : state.depotCount,
      inboxCount:
        prediction.item.location === "inbox"
          ? Math.max(0, state.inboxCount - removedCount)
          : state.inboxCount,
      entries: state.entries.filter(
        (entry) =>
          entry.location === "stash" ||
          entry.itemId !== prediction.item.itemId,
      ),
    };
  }
  if (prediction.kind === "stash-deposit") {
    const existing = state.entries.find(
      (entry): entry is StashEntry =>
        entry.location === "stash" &&
        entry.itemTypeId === prediction.item.typeId,
    );
    const entry: OptimisticStashEntry = existing
      ? {
          ...existing,
          count: existing.count + prediction.count,
          optimistic: true,
        }
      : {
          location: "stash",
          itemTypeId: prediction.item.typeId,
          clientId: prediction.item.clientId,
          spriteId: prediction.item.spriteId,
          name: prediction.item.name,
          stackable: prediction.item.stackable,
          maxCount: prediction.item.maxCount,
          weight: prediction.item.tooltip.weight,
          ...(prediction.item.stowable ? { stowable: true } : {}),
          count: prediction.count,
          optimistic: true,
        };
    const showEntry =
      state.location === "stash" &&
      state.page === 1 &&
      matchesQuery(entry.name, state.query);
    return {
      ...state,
      stashCount: existing ? state.stashCount : state.stashCount + 1,
      entries: existing
        ? state.entries.map((candidate) =>
            candidate.location === "stash" &&
            candidate.itemTypeId === entry.itemTypeId
              ? entry
              : candidate,
          )
        : showEntry
          ? [...state.entries, entry]
          : state.entries,
    };
  }

  const remaining = prediction.item.count - prediction.count;
  return {
    ...state,
    stashCount:
      remaining === 0 ? Math.max(0, state.stashCount - 1) : state.stashCount,
    entries:
      remaining === 0
        ? state.entries.filter(
            (entry) =>
              entry.location !== "stash" ||
              entry.itemTypeId !== prediction.item.itemTypeId,
          )
        : state.entries.map((entry) =>
            entry.location === "stash" &&
            entry.itemTypeId === prediction.item.itemTypeId
              ? { ...entry, count: remaining, optimistic: true }
              : entry,
          ),
  };
}
