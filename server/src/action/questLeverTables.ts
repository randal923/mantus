import type { Position } from "@tibia/protocol";
import { positionKey } from "../positionKey";

/**
 * One world mutation a quest-lever branch performs. Every target is re-read
 * from live tile state at execution time; an impossible operation (target
 * absent, duplicate create) is skipped rather than half-applied.
 */
export type QuestLeverOperation =
  | { readonly kind: "remove"; readonly position: Position; readonly itemId: number }
  | { readonly kind: "create"; readonly position: Position; readonly itemId: number }
  | {
      readonly kind: "transform";
      readonly position: Position;
      readonly fromItemId: number;
      readonly toItemId: number;
    };

/** Creatures standing on `from` are moved before the branch operations run. */
export interface QuestLeverRelocation {
  readonly from: Position;
  readonly to: Position;
  /** Monsters go here when set (Canary's sewer lever splits the two). */
  readonly monstersTo?: Position;
}

export interface QuestLeverBranch {
  readonly operations: ReadonlyArray<QuestLeverOperation>;
  /**
   * The branch fires only when the first operation's target is live (Canary
   * guards the katana door and bear stone this way: a missing target leaves
   * the lever unflipped and answers nothing).
   */
  readonly requiresPrimaryTarget?: boolean;
  readonly relocations?: ReadonlyArray<QuestLeverRelocation>;
}

/**
 * A stateful quest lever mirroring Canary's uid/aid-registered lever scripts.
 * The lever item's own type id is the state: `leverOffId` pulls run the
 * `pull` branch, `leverOnId` pulls run `reset`. All levers in
 * `leverPositions` flip together (the Rookgaard sewer bridge has one on each
 * bank).
 */
export interface QuestLeverDefinition {
  readonly id: string;
  readonly leverOffId: number;
  readonly leverOnId: number;
  readonly leverPositions: ReadonlyArray<Position>;
  readonly pull: QuestLeverBranch;
  readonly reset: QuestLeverBranch;
}

export interface QuestLeverTrigger {
  readonly definition: QuestLeverDefinition;
  /**
   * "lever": toggle by the used lever's current state. "reset": force the
   * reset branch without relocations and re-arm the levers (Canary's katana
   * door registers this on the door itself).
   */
  readonly role: "lever" | "reset";
}

const LEVER_OFF = 2_772;
const LEVER_ON = 2_773;

/**
 * Rookgaard bear room (Canary bear_room_quest_stone.lua, aid 30006 stamped
 * by startup/tables/lever.lua at the lever position). Pulling removes the
 * blocking stone; pulling back recreates it. Canary's live aid variant
 * creates the stone regardless of who stands there; we relocate creatures
 * off the tile first like its uid-1056 sibling script, so nobody is sealed
 * inside the stone.
 */
const BEAR_ROOM: QuestLeverDefinition = {
  id: "rookgaard-bear-room",
  leverOffId: LEVER_OFF,
  leverOnId: LEVER_ON,
  leverPositions: [{ x: 32_148, y: 32_105, z: 11 }],
  pull: {
    operations: [
      { kind: "remove", position: { x: 32_145, y: 32_101, z: 11 }, itemId: 1_791 },
    ],
    requiresPrimaryTarget: true,
  },
  reset: {
    operations: [
      { kind: "create", position: { x: 32_145, y: 32_101, z: 11 }, itemId: 1_791 },
    ],
    relocations: [
      {
        from: { x: 32_145, y: 32_101, z: 11 },
        to: { x: 32_145, y: 32_102, z: 11 },
      },
    ],
  },
};

/**
 * Rookgaard katana room (Canary katana_quest_lever.lua uid 30029 +
 * katana_quest_door.lua uid 22006, both stamped by startup tables). The
 * lever opens/closes the door (5107 closed / 5108 open, key-variant door
 * set); closing relocates whoever stands in the doorway one tile east.
 * Using the door itself closes it and re-arms the lever (Canary's
 * katana_quest_door registers exactly that on the door position).
 */
const KATANA_DOOR_POSITION = { x: 32_177, y: 32_148, z: 11 } as const;
const KATANA_ROOM: QuestLeverDefinition = {
  id: "rookgaard-katana-room",
  leverOffId: LEVER_OFF,
  leverOnId: LEVER_ON,
  leverPositions: [{ x: 32_182, y: 32_145, z: 11 }],
  pull: {
    operations: [
      {
        kind: "transform",
        position: KATANA_DOOR_POSITION,
        fromItemId: 5_107,
        toItemId: 5_108,
      },
    ],
    requiresPrimaryTarget: true,
  },
  reset: {
    operations: [
      {
        kind: "transform",
        position: KATANA_DOOR_POSITION,
        fromItemId: 5_108,
        toItemId: 5_107,
      },
    ],
    requiresPrimaryTarget: true,
    relocations: [
      {
        from: KATANA_DOOR_POSITION,
        to: { x: 32_178, y: 32_148, z: 11 },
      },
    ],
  },
};

/**
 * Rookgaard sewer bridge (Canary sewer_lever.lua, aid 50239 carried by the
 * OTBM on both levers). Canary transforms the three channel grounds to
 * drawbridge 5770; grounds are baked in our map, so extension instead
 * creates drawbridge items on the tiles and removes the shallow-water rails
 * (4634/4636) — the passability overlay in questTilePassability.ts makes
 * the span walkable exactly while the drawbridge items are present.
 * Retracting relocates creatures off the span like Canary: players to the
 * east bank, monsters one tile further.
 */
const SEWER_SPAN: ReadonlyArray<Position> = [
  { x: 32_099, y: 32_205, z: 8 },
  { x: 32_100, y: 32_205, z: 8 },
  { x: 32_101, y: 32_205, z: 8 },
];
const SEWER_BRIDGE_ID = 5_770;
const SEWER_BRIDGE: QuestLeverDefinition = {
  id: "rookgaard-sewer-bridge",
  leverOffId: LEVER_OFF,
  leverOnId: LEVER_ON,
  leverPositions: [
    { x: 32_098, y: 32_204, z: 8 },
    { x: 32_104, y: 32_204, z: 8 },
  ],
  pull: {
    operations: [
      ...SEWER_SPAN.map(
        (position) =>
          ({ kind: "create", position, itemId: SEWER_BRIDGE_ID }) as const,
      ),
      { kind: "remove", position: SEWER_SPAN[0]!, itemId: 4_634 },
      { kind: "remove", position: SEWER_SPAN[2]!, itemId: 4_636 },
    ],
  },
  reset: {
    operations: [
      ...SEWER_SPAN.map(
        (position) =>
          ({ kind: "remove", position, itemId: SEWER_BRIDGE_ID }) as const,
      ),
      { kind: "create", position: SEWER_SPAN[0]!, itemId: 4_634 },
      { kind: "create", position: SEWER_SPAN[2]!, itemId: 4_636 },
    ],
    relocations: SEWER_SPAN.map((from) => ({
      from,
      to: { x: 32_102, y: 32_205, z: 8 },
      monstersTo: { x: 32_103, y: 32_205, z: 8 },
    })),
  },
};

export const QUEST_LEVER_DEFINITIONS: ReadonlyArray<QuestLeverDefinition> = [
  BEAR_ROOM,
  KATANA_ROOM,
  SEWER_BRIDGE,
];

const triggers = new Map<string, QuestLeverTrigger>();
for (const definition of QUEST_LEVER_DEFINITIONS) {
  for (const position of definition.leverPositions) {
    triggers.set(positionKey(position), { definition, role: "lever" });
  }
}
// The katana door is itself a trigger: using it forces the closed state.
triggers.set(positionKey(KATANA_DOOR_POSITION), {
  definition: KATANA_ROOM,
  role: "reset",
});

/**
 * Use-map positions owned by a quest lever, checked by `resolveWorldAction`
 * ahead of the generic item behaviours (the sewer levers carry an actionId
 * in the map and would otherwise fail closed; the katana door would open as
 * a plain key-variant door).
 */
export const QUEST_LEVER_TRIGGERS: ReadonlyMap<string, QuestLeverTrigger> =
  triggers;
