import type { Direction } from "@tibia/protocol";
import {
  MOVEMENT_BINDING_DIRECTIONS,
  isMovementBindingAction,
  type KeyBindingAction,
  type KeyBindings,
  type MovementBindingAction,
} from "../hotkeys/keyBindings";

// Arrow keys and numpad diagonals stay built-in movement keys unless the user
// binds them to another action; explicit movement bindings always win.
const BUILT_IN_DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: "north",
  ArrowRight: "east",
  ArrowDown: "south",
  ArrowLeft: "west",
  Numpad7: "northwest",
  Numpad9: "northeast",
  Numpad1: "southwest",
  Numpad3: "southeast",
};

export function getMovementKeyDirections(
  bindings: KeyBindings,
): Readonly<Record<string, Direction>> {
  const directions: Record<string, Direction> = { ...BUILT_IN_DIRECTIONS };
  for (const action of Object.keys(bindings) as KeyBindingAction[]) {
    const binding = bindings[action];
    if (binding && !isMovementBindingAction(action)) {
      delete directions[binding];
    }
  }
  for (const action of Object.keys(
    MOVEMENT_BINDING_DIRECTIONS,
  ) as MovementBindingAction[]) {
    const binding = bindings[action];
    if (binding) directions[binding] = MOVEMENT_BINDING_DIRECTIONS[action];
  }
  return directions;
}
