import type { DepotCache } from "./DepotCache";
import type { DepotCacheEvent } from "./DepotCacheEvent";
import type { LoadedDepot } from "./LoadedDepot";

const LOAD_BUFFER_TTL_MS = 60_000;

interface LoadBuffer {
  readonly startedAt: number;
  readonly events: DepotCacheEvent[];
}

/**
 * Per-character memory-resident depot state. Between `beginLoad` and `attach`
 * external deliveries (mail, rewards, expiry returns) are buffered and
 * replayed on attach so nothing committed during the login window is lost;
 * upserts are id-keyed, so replaying an event the load already saw is a no-op.
 */
export class DepotCacheManager {
  private readonly caches = new Map<string, DepotCache>();
  private readonly loadBuffers = new Map<string, LoadBuffer>();

  beginLoad(characterId: string, now: number): void {
    this.loadBuffers.set(characterId, { startedAt: now, events: [] });
  }

  attach(loaded: LoadedDepot): void {
    let cache: DepotCache = {
      items: loaded.items,
      stash: loaded.stash,
      depotRevisions: loaded.depotRevisions,
      inboxRevision: loaded.inboxRevision,
      stashRevision: loaded.stashRevision,
    };
    const buffer = this.loadBuffers.get(loaded.characterId);
    this.loadBuffers.delete(loaded.characterId);
    for (const event of buffer?.events ?? []) {
      cache = applyEvent(cache, event);
    }
    this.caches.set(loaded.characterId, cache);
  }

  detach(characterId: string): void {
    this.caches.delete(characterId);
    this.loadBuffers.delete(characterId);
  }

  get(characterId: string): DepotCache | undefined {
    return this.caches.get(characterId);
  }

  apply(characterId: string, event: DepotCacheEvent): boolean {
    const cache = this.caches.get(characterId);
    if (!cache) return false;
    this.caches.set(characterId, applyEvent(cache, event));
    return true;
  }

  /** Delivery from another flow: applies if online, buffers if mid-login. */
  applyExternal(characterId: string, event: DepotCacheEvent): void {
    const buffer = this.loadBuffers.get(characterId);
    if (buffer) {
      buffer.events.push(event);
      return;
    }
    this.apply(characterId, event);
  }

  expireLoadBuffers(now: number): void {
    for (const [characterId, buffer] of this.loadBuffers) {
      if (now - buffer.startedAt > LOAD_BUFFER_TTL_MS) {
        this.loadBuffers.delete(characterId);
      }
    }
  }
}

function applyEvent(cache: DepotCache, event: DepotCacheEvent): DepotCache {
  const itemsById = new Map(cache.items.map((item) => [item.id, item]));
  for (const itemId of event.removedItemIds ?? []) itemsById.delete(itemId);
  for (const item of event.upserts ?? []) itemsById.set(item.id, item);
  const stash = new Map(cache.stash);
  for (const stashSet of event.stashSets ?? []) {
    if (stashSet.count > 0) {
      stash.set(stashSet.itemTypeId, stashSet.count);
      continue;
    }
    stash.delete(stashSet.itemTypeId);
  }
  const depotRevisions = new Map(cache.depotRevisions);
  let inboxRevision = cache.inboxRevision;
  let stashRevision = cache.stashRevision;
  for (const bump of event.bumps ?? []) {
    if (bump.kind === "depot") {
      depotRevisions.set(
        bump.depotId,
        (depotRevisions.get(bump.depotId) ?? 1) + 1,
      );
      continue;
    }
    if (bump.kind === "inbox") {
      inboxRevision += 1;
      continue;
    }
    stashRevision += 1;
  }
  return {
    items: [...itemsById.values()],
    stash,
    depotRevisions,
    inboxRevision,
    stashRevision,
  };
}
