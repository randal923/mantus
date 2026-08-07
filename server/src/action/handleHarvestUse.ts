import { planHarvestMapItem } from "../item/plan/planHarvestMapItem";
import type { WorldAction } from "./WorldAction";
import type { WorldActionContext } from "./WorldActionContext";

/**
 * Picks fruit from a harvestable plant: the yield drops onto the plant's own
 * tile and the depleted plant regrows through decay (Canary's
 * blueberry_bush.lua shows no message or effect).
 */
export function handleHarvestUse(
  context: WorldActionContext,
  action: Extract<WorldAction, { kind: "harvest" }>,
): void {
  context.applyPlan(
    planHarvestMapItem({
      characterId: context.player.id,
      catalog: context.catalog,
      world: context.world,
      instanceId: action.item.instanceId,
      position: context.position,
      expectedVersion: action.item.revision ?? 1,
      toTypeId: action.harvest.toTypeId,
      yieldTypeId: action.harvest.yieldTypeId,
      yieldCount: action.harvest.yieldCount,
    }),
  );
}
