/** One entitled outfit and the addon bits granted with it. */
export interface OutfitEntitlementRecord {
  readonly lookType: number;
  readonly addons: number;
}

/** Everything the outfit window needs, all of it the owner's own. */
export interface OutfitSnapshot {
  readonly outfits: ReadonlyArray<OutfitEntitlementRecord>;
  readonly mounts: ReadonlyArray<number>;
}

/**
 * Durable outfit and mount entitlements. Grants are idempotent by primary
 * key; addon grants merge into the existing mask so re-granting an outfit
 * never takes an addon away. Nothing here is client-writable — the only
 * client-facing operation is selecting from what is already owned.
 */
export interface OutfitStore {
  loadSnapshot(characterId: string): Promise<OutfitSnapshot>;
  grantOutfit(input: {
    characterId: string;
    lookType: number;
    addons: number;
  }): Promise<{ granted: boolean }>;
  grantMount(input: {
    characterId: string;
    mountId: number;
  }): Promise<{ granted: boolean }>;
  /**
   * Persists a selection only when the character owns the look type with the
   * requested addons and (when non-zero) the mount. Returns "not-owned"
   * otherwise, having written nothing.
   */
  select(input: {
    characterId: string;
    lookType: number;
    head: number;
    body: number;
    legs: number;
    feet: number;
    addons: number;
    mountId: number;
  }): Promise<{ status: "ok" } | { status: "failed"; reason: "not-owned" }>;
}
