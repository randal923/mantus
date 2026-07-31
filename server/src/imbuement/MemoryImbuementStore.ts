import type {
  ImbuementMutationRequest,
  ImbuementMutationResult,
  ImbuementStore,
} from "./ImbuementStore";

/**
 * In-memory imbuement store for unit tests: charges gold from a settable
 * balance and echoes the attribute write back as a mutation; material rows
 * are exercised by the Pg integration tests.
 */
export class MemoryImbuementStore implements ImbuementStore {
  readonly requests: ImbuementMutationRequest[] = [];
  goldBalances = new Map<string, number>();
  materialCounts = new Map<number, number>();
  /** Absolute stash counts the last committed mutation wrote. */
  stashCounts = new Map<number, number>();

  async mutate(
    characterId: string,
    request: ImbuementMutationRequest,
  ): Promise<ImbuementMutationResult> {
    for (const material of request.materials) {
      if ((this.materialCounts.get(material.itemTypeId) ?? 0) < material.count) {
        return { status: "insufficient-materials" };
      }
    }
    const gold = this.goldBalances.get(characterId) ?? 0;
    if (gold < request.goldCost) return { status: "insufficient-gold" };
    this.goldBalances.set(characterId, gold - request.goldCost);
    for (const material of request.materials) {
      this.materialCounts.set(
        material.itemTypeId,
        (this.materialCounts.get(material.itemTypeId) ?? 0) - material.count,
      );
    }
    for (const stashOp of request.stashOps) {
      this.stashCounts.set(stashOp.itemTypeId, stashOp.count);
    }
    this.requests.push(request);
    return { status: "committed", mutation: { after: [] } };
  }
}
