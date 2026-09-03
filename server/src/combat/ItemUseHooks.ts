import type {
  UseItemMessage,
  UseItemWithMessage,
} from "@tibia/protocol";
import type { Session } from "../Session";

/**
 * The server's full item-use routing (exhaust gate, the item-specific
 * handlers such as exercise weapons, tools, watches and teleport scrolls,
 * then the generic item handler). The action bar hands its item uses here so
 * a button does exactly what the same click in the inventory does; the two
 * paths must never diverge.
 */
export interface ItemUseHooks {
  use(session: Session, intent: UseItemMessage, now: number): boolean;
  useWith(session: Session, intent: UseItemWithMessage, now: number): boolean;
}
