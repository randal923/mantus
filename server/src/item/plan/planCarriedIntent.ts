import type { Character } from "../../character/Character";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { ItemIntent } from "../ItemIntent";
import type { CarriedPlan } from "./CarriedPlan";
import { planDrop } from "./planDrop";
import { planEquip } from "./planEquip";
import { planLoot } from "./planLoot";
import { planMoveMapItem } from "./planMoveMapItem";
import { planMoveToContainer } from "./planMoveToContainer";
import { planPickup } from "./planPickup";
import { planRotate } from "./planRotate";
import { planSplitStack } from "./planSplitStack";
import { planUnequip } from "./planUnequip";
import { planWriteText } from "./planWriteText";
import type { WorldItemsView } from "./WorldItemsView";

export type CarriedIntentPlanResult =
  | { readonly kind: "planned"; readonly plan: CarriedPlan }
  | { readonly kind: "rejected" }
  | { readonly kind: "unsupported" };

/**
 * Routes an intent to its memory-first planner. "unsupported" falls through
 * to the DB-first path (consumption); "rejected" mirrors the retired DB ops'
 * validation throws.
 */
export function planCarriedIntent(input: {
  readonly intent: ItemIntent;
  readonly item: Item | undefined;
  readonly items: ReadonlyArray<Item>;
  readonly capacityMax: number;
  readonly world: WorldItemsView;
  readonly catalog: ItemCatalog;
  readonly characterId: string;
  readonly level: number;
  readonly vocation: Character["vocation"];
}): CarriedIntentPlanResult {
  const { intent, catalog, characterId, items, world } = input;
  const planned = (plan: CarriedPlan | null): CarriedIntentPlanResult =>
    plan ? { kind: "planned", plan } : { kind: "rejected" };
  switch (intent.type) {
    case "equip-item":
      return planned(
        planEquip({
          characterId,
          catalog,
          items,
          level: input.level,
          vocation: input.vocation,
          itemId: intent.itemId,
          expectedVersion: intent.revision,
          slot: intent.slot,
        }),
      );
    case "unequip-item":
      return planned(
        planUnequip({
          characterId,
          catalog,
          items,
          itemId: intent.itemId,
          expectedVersion: intent.revision,
          slot: intent.slot,
          destination: intent.destination,
        }),
      );
    case "move-item":
      return planned(
        planMoveToContainer({
          characterId,
          catalog,
          items,
          itemId: intent.itemId,
          expectedVersion: intent.revision,
          destinationContainerId: intent.destinationContainerId,
          destinationVersion: intent.destinationRevision,
          destinationSlot: intent.destinationSlot,
          requestedCount: intent.count,
        }),
      );
    case "split-stack":
      return planned(
        planSplitStack({
          characterId,
          catalog,
          items,
          itemId: intent.itemId,
          expectedVersion: intent.revision,
          count: intent.count,
        }),
      );
    case "rotate-item":
      return planned(
        planRotate({
          characterId,
          catalog,
          items,
          itemId: intent.itemId,
          expectedVersion: intent.revision,
        }),
      );
    case "write-item":
      return planned(
        planWriteText({
          characterId,
          catalog,
          items,
          itemId: intent.itemId,
          expectedVersion: intent.revision,
          text: intent.text,
        }),
      );
    case "loot-item":
      return planned(
        planLoot({
          characterId,
          catalog,
          carried: { items, capacityMax: input.capacityMax },
          world,
          containerId: intent.containerId,
          itemId: intent.itemId,
          expectedVersion: intent.revision,
          destination: intent.destination,
        }),
      );
    case "pickup-item":
      return planned(
        planPickup({
          characterId,
          catalog,
          carried: { items, capacityMax: input.capacityMax },
          world,
          itemInstanceId: intent.itemId,
          expectedVersion: intent.revision,
          position: intent.position,
          destination: intent.destination,
          equipSlot: intent.equipSlot,
          level: input.level,
          vocation: input.vocation,
        }),
      );
    case "drop-item":
      return planned(
        planDrop({
          characterId,
          catalog,
          carried: { items },
          world,
          itemId: intent.itemId,
          expectedVersion: intent.revision,
          position: intent.position,
          requestedCount: intent.count,
        }),
      );
    case "move-map-item":
      return planned(
        planMoveMapItem({
          characterId,
          catalog,
          world,
          itemInstanceId: intent.itemId,
          expectedVersion: intent.revision,
          fromPosition: intent.fromPosition,
          toPosition: intent.toPosition,
        }),
      );
    case "use-item":
    case "use-item-with": {
      if (!input.item || !catalog.require(input.item.typeId).rotateTo) {
        return { kind: "unsupported" };
      }
      return planned(
        planRotate({
          characterId,
          catalog,
          items,
          itemId: intent.itemId,
          expectedVersion: intent.revision,
        }),
      );
    }
    default:
      return { kind: "unsupported" };
  }
}
