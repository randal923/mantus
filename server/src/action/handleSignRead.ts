import { isNear } from "../item/isNear";
import { mapItemAttributes } from "./mapItemAttributes";
import type { WorldAction } from "./WorldAction";
import type { WorldActionContext } from "./WorldActionContext";

const MAX_TEXT_LENGTH = 3_997;

/**
 * Sends a readable map item's text. Distance-readable types (signs) only
 * need visibility; everything else requires adjacency. Map items stay
 * read-only until a write-map path ships.
 */
export function handleSignRead(
  context: WorldActionContext,
  action: Extract<WorldAction, { kind: "read" }>,
): void {
  const { session, player, world, position } = context;
  const { item, type } = action;
  const text = type.text;
  if (!text) {
    session.sendError("item-action-failed");
    return;
  }
  const near = isNear(player.position, position);
  const visible =
    text.allowDistanceRead &&
    world.canSee(player.position, position, session.viewRange);
  if (!near && !visible) {
    session.sendError("item-action-failed");
    return;
  }
  const raw = mapItemAttributes(world, item).text;
  session.send({
    type: "item-text",
    itemId: item.instanceId,
    revision: item.revision ?? 1,
    name: type.name,
    text: typeof raw === "string" ? raw.slice(0, MAX_TEXT_LENGTH) : "",
    writeable: false,
    maxLength: text.maxLength,
  });
}
