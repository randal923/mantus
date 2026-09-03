import type { UseItemMessage } from "@tibia/protocol";
import { GOLD_CONVERTER_TYPE_IDS } from "../item/goldConverterTypeIds";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { planGoldConverterSweep } from "../item/plan/planGoldConverterSweep";
import type { Session } from "../Session";
import { describeGoldConverterSweep } from "./describeGoldConverterSweep";

export const GOLD_CONVERTER_NOTHING_MESSAGE =
  "You need at least 100 gold or platinum coins to convert.";

/**
 * The gold converter (the store's Gold Converter, Canary's
 * `gold_converter.lua` reworked as a sweep): a plain use converts every coin
 * the character carries by total — 100 gold to a platinum, 100 platinum to a
 * crystal — one charge per conversion, in one atomic carried mutation
 * applied in-tick and persisted as one transaction behind it. The client only
 * named an owned item id and revision; ownership, charges and the coin totals
 * are re-read here at execution time.
 */
export class GoldConverterService {
  constructor(
    private readonly items: ItemIntentHandler,
    private readonly catalog: ItemCatalog,
  ) {}

  /** True when the intent was consumed as a gold converter use. */
  handleUseItem(session: Session, intent: UseItemMessage, now: number): boolean {
    const characterId = session.playerId;
    if (!characterId) return false;
    const snapshot = this.items.inventorySnapshot(characterId);
    const converter = snapshot?.items.find(
      (candidate) => candidate.id === intent.itemId,
    );
    if (!snapshot || !converter || !GOLD_CONVERTER_TYPE_IDS.has(converter.typeId)) {
      return false;
    }
    // A stale revision or a DB-first operation in flight (a shop purchase, a
    // charge spend) may rewrite the cache under this plan; fail closed.
    if (converter.version !== intent.revision || session.itemOperationPending) {
      session.sendError("item-action-failed");
      return true;
    }
    const sweep = planGoldConverterSweep({
      characterId,
      catalog: this.catalog,
      items: snapshot.items,
      converterId: converter.id,
      converterVersion: converter.version,
    });
    if (!sweep) {
      session.send({
        type: "combat-log",
        kind: "condition",
        text: GOLD_CONVERTER_NOTHING_MESSAGE,
      });
      return true;
    }
    this.items.applyCarriedPlan(session, characterId, sweep.plan, now);
    session.send({
      type: "combat-log",
      kind: "condition",
      text: describeGoldConverterSweep(sweep),
    });
    return true;
  }
}
