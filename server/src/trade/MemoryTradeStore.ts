import { collectReachableItemIds } from "../item/collectReachableItemIds";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { MemoryItemStore } from "../item/MemoryItemStore";
import { planTradeDelivery } from "./planTradeDelivery";
import { tradeOfferSubtree } from "./tradeOfferSubtree";
import type {
  TradeCommitInput,
  TradeCommitLeg,
  TradeCommitResult,
  TradeStore,
} from "./TradeStore";

/**
 * In-memory TradeStore over a shared MemoryItemStore, mirroring the Pg
 * store's execution-time verification so service tests exercise the same
 * failure paths: both legs verify before either mutates.
 */
export class MemoryTradeStore implements TradeStore {
  constructor(
    private readonly items: MemoryItemStore,
    private readonly catalog: ItemCatalog,
  ) {}

  async loadReservations(characterId: string): Promise<ReadonlyArray<Item>> {
    const all = this.items.allItems();
    const roots = all.filter(
      (item) =>
        item.location.kind === "trade-reservation" &&
        item.location.characterId === characterId,
    );
    return roots.flatMap((root) =>
      tradeOfferSubtree(all, root.id).map((entry) => entry.item),
    );
  }

  async commitTrade(input: TradeCommitInput): Promise<TradeCommitResult> {
    const all = this.items.allItems();
    const byId = new Map(all.map((item) => [item.id, item]));
    const plans: Array<ReadonlyArray<Item>> = [];
    for (const leg of input.legs) {
      const verified = this.verifyLeg(byId, leg);
      if (!verified) return { status: "failed" };
      const receiverIds = collectReachableItemIds(
        all,
        leg.receiverCharacterId,
      );
      const planned = planTradeDelivery({
        catalog: this.catalog,
        receiverCharacterId: leg.receiverCharacterId,
        receiverItems: all.filter((item) => receiverIds.has(item.id)),
        receiverCapacityMax: leg.receiverCapacityMax,
        legItems: leg.items,
      });
      if (planned.status !== "ok") {
        return {
          status: planned.status,
          failedCharacterId: leg.receiverCharacterId,
        };
      }
      plans.push(planned.delivered);
    }
    const [first, second] = plans;
    if (!first || !second) return { status: "failed" };
    for (const delivered of plans) {
      for (const item of delivered) this.items.seed(item);
    }
    return { status: "committed", delivered: [first, second] };
  }

  private verifyLeg(
    byId: ReadonlyMap<string, Item>,
    leg: TradeCommitLeg,
  ): boolean {
    const snapshotRoot = leg.items[0];
    if (!snapshotRoot) return false;
    const stored = byId.get(snapshotRoot.id);
    return (
      stored !== undefined &&
      stored.version === snapshotRoot.version &&
      stored.location.kind === "trade-reservation" &&
      stored.location.characterId === leg.giverCharacterId
    );
  }
}
