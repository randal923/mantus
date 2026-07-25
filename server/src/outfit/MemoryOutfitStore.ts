import type { OutfitSnapshot, OutfitStore } from "./OutfitStore";

/**
 * In-memory OutfitStore mirroring the Pg store's rules: addon bits merge on
 * re-grant, and a selection is refused unless the outfit, every requested
 * addon bit, and the mount are all owned.
 */
export class MemoryOutfitStore implements OutfitStore {
  private readonly outfits = new Map<string, Map<number, number>>();
  private readonly mounts = new Map<string, Set<number>>();
  readonly selections = new Map<
    string,
    { lookType: number; addons: number; mountId: number }
  >();

  async loadSnapshot(characterId: string): Promise<OutfitSnapshot> {
    return {
      outfits: [...(this.outfits.get(characterId) ?? new Map())]
        .map(([lookType, addons]) => ({ lookType, addons }))
        .sort((left, right) => left.lookType - right.lookType),
      mounts: [...(this.mounts.get(characterId) ?? [])].sort((a, b) => a - b),
    };
  }

  async grantOutfit(input: {
    characterId: string;
    lookType: number;
    addons: number;
  }): Promise<{ granted: boolean }> {
    const owned = this.outfits.get(input.characterId) ?? new Map<number, number>();
    const before = owned.get(input.lookType);
    const merged = (before ?? 0) | input.addons;
    owned.set(input.lookType, merged);
    this.outfits.set(input.characterId, owned);
    return { granted: before === undefined || before !== merged };
  }

  async grantMount(input: {
    characterId: string;
    mountId: number;
  }): Promise<{ granted: boolean }> {
    const owned = this.mounts.get(input.characterId) ?? new Set<number>();
    const granted = !owned.has(input.mountId);
    owned.add(input.mountId);
    this.mounts.set(input.characterId, owned);
    return { granted };
  }

  async select(input: {
    characterId: string;
    lookType: number;
    head: number;
    body: number;
    legs: number;
    feet: number;
    addons: number;
    mountId: number;
  }): Promise<{ status: "ok" } | { status: "failed"; reason: "not-owned" }> {
    const ownedAddons = this.outfits.get(input.characterId)?.get(input.lookType);
    if (ownedAddons === undefined || (input.addons & ~ownedAddons) !== 0) {
      return { status: "failed", reason: "not-owned" };
    }
    if (
      input.mountId !== 0 &&
      !this.mounts.get(input.characterId)?.has(input.mountId)
    ) {
      return { status: "failed", reason: "not-owned" };
    }
    this.selections.set(input.characterId, {
      lookType: input.lookType,
      addons: input.addons,
      mountId: input.mountId,
    });
    return { status: "ok" };
  }
}
