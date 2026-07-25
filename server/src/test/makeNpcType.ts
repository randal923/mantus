import type { NpcType } from "../creature/NpcType";

/**
 * A minimal valid NpcType for tests. Every field the content loader requires
 * has a default here, so adding a typed field to the model does not force an
 * edit in every test that only cares about dialogue.
 */
export function makeNpcType(overrides: Partial<NpcType> & { id: string }): NpcType {
  return {
    name: overrides.id,
    description: overrides.id,
    outfit: { lookType: 128, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
    health: 100,
    maxHealth: 100,
    speed: 100,
    walkIntervalMs: 0,
    walkRadius: 0,
    canChangeFloor: false,
    profession: "normal",
    speechBubble: "normal",
    voices: [],
    ...overrides,
  };
}
