import type { CreatureState, ServerMessage } from "@tibia/protocol";

/** Mirrors only the server's view-filtered creature projection for UI lists. */
export function updateVisibleCreatures(
  current: ReadonlyArray<CreatureState>,
  message: ServerMessage,
): ReadonlyArray<CreatureState> {
  switch (message.type) {
    case "welcome":
      return message.creatures;
    case "creature-joined":
      return [
        ...current.filter((creature) => creature.id !== message.creature.id),
        message.creature,
      ];
    case "creature-left":
      return current.filter((creature) => creature.id !== message.creatureId);
    case "creature-moved":
      return current.map((creature) =>
        creature.id === message.creatureId &&
        message.positionRevision >= creature.positionRevision
          ? {
              ...creature,
              position: message.position,
              direction: message.direction,
              positionRevision: message.positionRevision,
            }
          : creature,
      );
    case "position-correction":
      return current.map((creature) =>
        creature.id === message.playerId &&
        message.positionRevision >= creature.positionRevision
          ? {
              ...creature,
              position: message.position,
              direction: message.direction,
              positionRevision: message.positionRevision,
            }
          : creature,
      );
    default:
      return current;
  }
}
