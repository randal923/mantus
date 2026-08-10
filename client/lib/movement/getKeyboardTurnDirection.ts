import {
  DEFAULT_TURN_MODIFIER,
  type Direction,
  type TurnModifier,
} from "@tibia/protocol";
import {
  MOVEMENT_BINDING_DIRECTIONS,
  type KeyBindings,
  type MovementBindingAction,
} from "../hotkeys/keyBindings";

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
  bindings: KeyBindings,
  modifier: TurnModifier = DEFAULT_TURN_MODIFIER,
): Direction | null {
  if (!event[TURN_MODIFIER_EVENT_KEYS[modifier]]) return null;
  for (const action of Object.keys(
    MOVEMENT_BINDING_DIRECTIONS,
  ) as MovementBindingAction[]) {
    if (bindings[action] === event.code) {
      return MOVEMENT_BINDING_DIRECTIONS[action];
    }
  }
  return null;
}
