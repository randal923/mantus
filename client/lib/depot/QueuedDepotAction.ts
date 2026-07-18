import type { InventoryPrediction } from "../inventory/InventoryPrediction";
import type { DepotPrediction } from "./DepotPrediction";

export interface QueuedDepotAction {
  readonly depotPrediction: DepotPrediction;
  readonly inventoryPrediction: InventoryPrediction;
}
