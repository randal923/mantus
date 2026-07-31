import type { Position } from "@tibia/protocol";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { CarriedPlan } from "../item/plan/CarriedPlan";
import type { MapItem } from "../MapItem";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { ChestDefinition } from "./ChestDefinition";
import type { WorldActionWorldView } from "./WorldActionWorldView";

/** Execution-time context handed to every registered world-action handler. */
export interface WorldActionContext {
  readonly session: Session;
  readonly player: Player;
  readonly position: Position;
  readonly now: number;
  /** Server wall clock, for the world-time reply. */
  readonly wallClockMs: number;
  readonly world: WorldActionWorldView;
  readonly catalog: ItemCatalog;
  readonly doorLevels: ReadonlyMap<string, number>;
  /** House-tile authorization for this character at execution time. */
  readonly houseAccess: (characterId: string, position: Position) => boolean;
  /**
   * True when this character may redecorate the house tile — owner or
   * subowner, never a mere guest. Absent when no house service is wired, in
   * which case unwrapping fails closed.
   */
  readonly decorateAccess?: (
    characterId: string,
    position: Position,
  ) => boolean;
  /** Applies a transform plan in-tick and persists it; null fails the intent. */
  readonly applyPlan: (plan: CarriedPlan | null) => void;
  /** Present when a podium service is wired; opens the edit window. */
  readonly openPodium?: (item: MapItem) => void;
  /** Present when the daily-reward service is wired; projects claim state. */
  readonly openDailyRewards?: () => void;
  readonly openImbuementWindow?: () => void;
  /** Grants a chest reward atomically; absent without a chest store. */
  readonly lootChest?: (chest: ChestDefinition) => void;
}
