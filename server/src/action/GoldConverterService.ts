import type { UseItemOnItemMessage } from "@tibia/protocol";
import { GOLD_CONVERTER_TYPE_IDS } from "../item/goldConverterTypeIds";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { planGoldConversion } from "../item/plan/planGoldConversion";
import type { Session } from "../Session";

/**
 * The gold converter (Canary's `gold_converter.lua`): used on a carried coin
 * stack it exchanges the stack and burns a charge in one atomic carried
 * mutation, applied in-tick and persisted as one transaction behind it. The
 * client only ever named two owned item ids and revisions; ownership, the
 * coin rule, charges and capacity are all re-read here at execution time.
 */
export class GoldConverterService {
  constructor(
    private readonly items: ItemIntentHandler,
    private readonly catalog: ItemCatalog,
  ) {}

  /** True when the intent was consumed as a gold converter use. */
  handle(session: Session, intent: UseItemOnItemMessage, now: number): boolean {
    const characterId = session.playerId;
    if (!characterId) return false;
    const snapshot = this.items.inventorySnapshot(characterId);
    const converter = snapshot?.items.find(
      (candidate) => candidate.id === intent.itemId,
    );
    if (!snapshot || !converter || !GOLD_CONVERTER_TYPE_IDS.has(converter.typeId)) {
      return false;
    }
    // A DB-first operation in flight (a shop purchase, a charge spend) may
    // rewrite the cache under this plan; wait for it like every carried use.
    if (session.itemOperationPending) {
      session.sendError("item-action-failed");
      return true;
    }
    const plan = planGoldConversion({
      characterId,
      catalog: this.catalog,
      items: snapshot.items,
      capacityMax: snapshot.capacityMax,
      converterId: intent.itemId,
      converterVersion: intent.revision,
      targetId: intent.targetItemId,
      targetVersion: intent.targetRevision,
    });
    if (!plan) {
      session.sendError("item-action-failed");
      return true;
    }
    this.items.applyCarriedPlan(session, characterId, plan, now);
    return true;
  }
}
