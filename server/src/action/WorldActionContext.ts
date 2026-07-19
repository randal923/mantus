import type { Position } from "@tibia/protocol";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { CarriedPlan } from "../item/plan/CarriedPlan";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { WorldActionWorldView } from "./WorldActionWorldView";

/** Execution-time context handed to every registered world-action handler. */
export interface WorldActionContext {
  readonly session: Session;
  readonly player: Player;
  readonly position: Position;
  readonly now: number;
  readonly world: WorldActionWorldView;
  readonly catalog: ItemCatalog;
  readonly doorLevels: ReadonlyMap<string, number>;
  /** House-tile authorization for this character at execution time. */
  readonly houseAccess: (characterId: string, position: Position) => boolean;
  /** Applies a transform plan in-tick and persists it; null fails the intent. */
  readonly applyPlan: (plan: CarriedPlan | null) => void;
}
