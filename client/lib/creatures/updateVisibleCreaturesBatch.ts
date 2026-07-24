import type { CreatureState, ServerMessage } from "@tibia/protocol";

/** Applies one browser frame's creature packets with one indexed state copy. */
export function updateVisibleCreaturesBatch(
  current: ReadonlyArray<CreatureState>,
  messages: ReadonlyArray<ServerMessage>,
): ReadonlyArray<CreatureState> {
  if (messages.length === 0) return current;
  let creatures = new Map(current.map((creature) => [creature.id, creature]));
  let changed = false;

  for (const message of messages) {
    if (message.type === "welcome") {
      creatures = new Map(
        message.creatures.map((creature) => [creature.id, creature]),
      );
      changed = true;
      continue;
    }
    if (message.type === "creature-joined") {
      creatures.set(message.creature.id, message.creature);
      changed = true;
      continue;
    }
    if (message.type === "creature-left") {
      changed = creatures.delete(message.creatureId) || changed;
      continue;
    }
    if (message.type === "creature-health") {
      const creature = creatures.get(message.creatureId);
      if (!creature) continue;
      creatures.set(message.creatureId, {
        ...creature,
        healthPercent: message.healthPercent,
      });
      changed = true;
      continue;
    }
    if (message.type === "creature-state-changed") {
      if (!creatures.has(message.creature.id)) continue;
      creatures.set(message.creature.id, message.creature);
      changed = true;
      continue;
    }
    if (message.type === "creature-moved") {
      const creature = creatures.get(message.creatureId);
      if (
        !creature ||
        message.positionRevision < creature.positionRevision
      ) {
        continue;
      }
      creatures.set(message.creatureId, {
        ...creature,
        position: message.position,
        direction: message.direction,
        positionRevision: message.positionRevision,
      });
      changed = true;
      continue;
    }
    if (message.type !== "position-correction") continue;
    const creature = creatures.get(message.playerId);
    if (
      !creature ||
      message.positionRevision < creature.positionRevision
    ) {
      continue;
    }
    creatures.set(message.playerId, {
      ...creature,
      position: message.position,
      direction: message.direction,
      positionRevision: message.positionRevision,
    });
    changed = true;
  }

  return changed ? [...creatures.values()] : current;
}
