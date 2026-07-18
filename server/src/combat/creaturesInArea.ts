import type { Position } from "@tibia/protocol";
import type { Creature } from "../creature/Creature";
import type { MonsterAbility } from "../creature/MonsterType";
import type { World } from "../World";
import type { SpellDefinition } from "./Spell";
import { areaPositions } from "./areaPositions";

export function creaturesInArea(
  world: World,
  origin: Position,
  center: Position,
  area: SpellDefinition["area"] | MonsterAbility["area"],
): Creature[] {
  const positions = areaPositions(origin, center, area);
  const creatures = new Map<string, Creature>();
  for (const position of positions) {
    if (
      !world.getTile(position) ||
      !world.hasLineOfSight(origin, position)
    ) {
      continue;
    }
    for (const creature of world.creaturesAt(position)) {
      creatures.set(creature.id, creature);
    }
  }
  return [...creatures.values()];
}
