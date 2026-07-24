import {
  DEFAULT_TURN_MODIFIER,
  type Direction,
  type TurnModifier,
} from "@tibia/protocol";

const TURN_DIRECTIONS: Readonly<Record<string, Direction>> = {
  KeyW: "north",
  KeyD: "east",
  KeyS: "south",
  KeyA: "west",
};

type KeyboardTurnEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "metaKey" | "shiftKey"
>;

const TURN_MODIFIER_EVENT_KEYS: Readonly<
  Record<TurnModifier, keyof KeyboardTurnEvent>
> = {
  Alt: "altKey",
  Control: "ctrlKey",
  Meta: "metaKey",
  Shift: "shiftKey",
};

export function getKeyboardTurnDirection(
  event: KeyboardTurnEvent,
  modifier: TurnModifier = DEFAULT_TURN_MODIFIER,
): Direction | null {
  if (!event[TURN_MODIFIER_EVENT_KEYS[modifier]]) return null;
  return TURN_DIRECTIONS[event.code] ?? null;
}
