import type { CharacterVocation } from "@tibia/protocol";
import type { Vocation } from "./Vocation";
import { PROGRESSION_DEFINITION_VERSION } from "./progressionDefinitionVersion";
import { VOCATION_DEFINITIONS } from "./vocationDefinitions";

export function getVocation(
  vocation: CharacterVocation,
  definitionVersion = PROGRESSION_DEFINITION_VERSION,
): Vocation {
  if (definitionVersion !== PROGRESSION_DEFINITION_VERSION) {
    throw new Error(
      `unsupported progression definition version ${definitionVersion}`,
    );
  }
  return VOCATION_DEFINITIONS[vocation];
}
