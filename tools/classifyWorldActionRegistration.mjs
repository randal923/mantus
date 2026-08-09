/**
 * Item ids the server answers today, grouped by the handler that owns them.
 * The server-side test `worldActionParity.test.ts` asserts these sets match
 * the live tables, so a table change that is not mirrored here fails there
 * rather than silently marking a registration "implemented".
 */
export const IMPLEMENTED_ITEM_IDS = {
  rope: [646, 3003],
  shovel: [3457, 5710],
  machete: [3308],
  scythe: [3453, 9596],
  pick: [3456],
  crowbar: [3304, 9598],
  "fishing-rod": [3483],
  clock: [2445, 2446, 2447, 2448, 2771, 2906, 6091],
  lever: [2772, 2773, 9110, 9111],
  "pressure-plate": [419, 420, 430, 431, 452, 453, 549, 562, 563, 564, 10145, 10146],
  trap: [2145, 2146, 2148, 3481, 3482, 3944, 3945, 12368],
};

/** Unique-id ranges Canary's common quest-reward chest action registers. */
export const IMPLEMENTED_CHEST_UID_RANGES = [
  [5000, 9000],
  [10000, 12000],
  // Rookgaard rapier chest: answered by rapier_quest.lua in Canary, imported
  // with its transcribed reward (SCRIPT_ANSWERED_CHESTS in
  // importCanaryChests.mjs).
  [14042, 14042],
  [14092, 14092],
];

/**
 * Per-file dispositions for registrations the generic rules cannot decide.
 * Every entry states the owning feature or the reason it is excluded, so no
 * registration is ever silently dropped.
 */
const FILE_DISPOSITIONS = [
  // Specific quest scripts the server reproduces must be named ABOVE the
  // structural rule that defers everything under /quests/ wholesale.
  {
    match:
      /^data-otservbr-global\/scripts\/actions\/rookgaard\/bear_room_quest\/bear_room_quest_stone\.lua$/,
    status: "implemented",
    owner: "agents/quest-parity-rookgaard",
    reason: "quest-lever table (aid 30006 stamped by startup/tables/lever.lua)",
  },
  {
    match:
      /^data-otservbr-global\/scripts\/actions\/rookgaard\/bear_room_quest\/bear_room_quest_lever\.lua$/,
    status: "excluded",
    owner: "agents/quest-parity-rookgaard",
    reason:
      "uid 1056 is stamped nowhere at the pinned commit (not in the OTBM, not in any startup table) — dead content; the aid-30006 sibling covers the room",
  },
  {
    match:
      /^data-otservbr-global\/scripts\/actions\/rookgaard\/katana_quest\/katana_quest_(lever|door)\.lua$/,
    status: "implemented",
    owner: "agents/quest-parity-rookgaard",
    reason:
      "quest-lever table (uid 30029/22006 stamped by startup lever/door_quest tables)",
  },
  {
    match: /^data-otservbr-global\/scripts\/actions\/rookgaard\/sewer_lever\.lua$/,
    status: "implemented",
    owner: "agents/quest-parity-rookgaard",
    reason:
      "quest-lever table (aid 50239 in the OTBM); grounds stay baked, the drawbridge is a created span item with a passability overlay",
  },
  {
    match: /^data-otservbr-global\/scripts\/actions\/rookgaard\/rapier_quest\.lua$/,
    status: "implemented",
    owner: "agents/quest-parity-rookgaard",
    reason:
      "chest import carries uid 14042 with the reward transcribed from this script",
  },
  {
    match: /^data-otservbr-global\/scripts\/actions\/rookgaard\/chest\.lua$/,
    status: "excluded",
    owner: "agents/quest-parity-rookgaard",
    reason:
      "aid 30492 is stamped nowhere at the pinned commit (not in the OTBM, not in any startup table) — dead content in Canary",
  },
  {
    match:
      /^data-otservbr-global\/scripts\/actions\/rookgaard\/goblin_temple_quest\.lua$/,
    status: "excluded",
    owner: "agents/quest-parity-rookgaard",
    reason:
      "uids 14049/14050 are stamped nowhere at the pinned commit (not in the OTBM, not in any startup table) — dead content in Canary",
  },
  {
    match:
      /^data-otservbr-global\/scripts\/movements\/rookgaard\/(level_bridge|premium_bridge)\.lua$/,
    status: "implemented",
    owner: "agents/quest-parity-rookgaard",
    reason: "movement-gate table enforced by PressurePlateRegistry.onStepIn",
  },
  {
    match:
      /^data-otservbr-global\/scripts\/quests\/cults_of_tibia\/actions_torch\.lua$/,
    status: "implemented",
    owner: "agents/quest-touch-actions",
    reason: "quest-touch table + tick-driven restore",
  },
  {
    match: /^data\/scripts\/actions\/doors\/quest_door\.lua$/,
    status: "deferred",
    owner: "todo-20 quest storage",
    reason: "quest doors are storage-gated and present Tibia's sealed message",
  },
  {
    match: /^data\/scripts\/actions\/doors\//,
    status: "implemented",
    owner: "todo-13 Feature 50",
    reason: "door state machine ships in handleDoorUse",
  },
  {
    match: /^data\/scripts\/movements\/closing_door\.lua$/,
    status: "implemented",
    owner: "todo-13 Feature 50",
    reason: "step-out auto-close ships in WorldActionRegistry.closeDoorBehind",
  },
  {
    match: /^data\/scripts\/movements\/(special_tiles|trap)\.lua$/,
    status: "implemented",
    owner: "todo-13 Feature 50",
    reason: "pressure plates and traps ship in PressurePlateRegistry",
  },
  {
    match: /^data\/scripts\/actions\/tools\/(rope|shovel|machete|scythe|pick|watch)\.lua$/,
    status: "implemented",
    owner: "todo-13 Feature 51",
    reason: "tool ships in ToolUseHandler",
  },
  {
    match: /^data\/scripts\/actions\/tools\/crowbar\.lua$/,
    status: "deferred",
    owner: "todo-20 quest storage",
    reason:
      "the crowbar is registered, but every branch of onUseCrowbar is gated on a quest storage value",
  },
  {
    match: /^data-otservbr-global\/scripts\/actions\/other\/trap\.lua$/,
    status: "deferred",
    owner: "todo-13 Feature 50",
    reason: "disarming a sprung trap by using it is not wired yet",
  },
  {
    match: /^data-otservbr-global\/scripts\/actions\/other\/fishing\.lua$/,
    status: "implemented",
    owner: "todo-13 Feature 51",
    reason: "fishing ships in handleFishingUse",
  },
  {
    match: /^data-otservbr-global\/scripts\/actions\/system\/quest_reward_common\.lua$/,
    status: "implemented",
    owner: "todo-13 Feature 50",
    reason: "quest chests ship in ChestService with a durable looted gate",
  },
  {
    match: /^data-otservbr-global\/scripts\/actions\/other\/others\/quest_system1\.lua$/,
    status: "implemented",
    owner: "todo-13 Feature 50",
    reason:
      "aid-2000 map chests are generated into quest-chests.json by buildQuestChests and served by ChestService; non-mutable hosts and side tables (tutorial, hota, quest-log) stay in TODO.md",
  },
  {
    match: /^data-otservbr-global\/scripts\/actions\/other\/others\/quest_system2\.lua$/,
    status: "implemented",
    owner: "todo-13 Feature 50",
    reason:
      "importable aid-2001 config entries are generated into quest-chests.json; storage-state-machine entries stay deferred in canary-quest-system2.json",
  },
  {
    match: /^data\/scripts\/actions\/items\/(foods|potions)\.lua$/,
    status: "implemented",
    owner: "todo-5 items",
    reason: "food and potion use ship in the item handler",
  },
  {
    match: /^data\/scripts\/actions\/items\/decay_to\.lua$/,
    status: "implemented",
    owner: "todo-5 items",
    reason: "catalog decay drives transform-on-decay",
  },
  {
    match: /^data\/scripts\/actions\/objects\/(market|stash)\.lua$/,
    status: "implemented",
    owner: "todo-12 economy",
    reason: "market and stash ship as their own services",
  },
  {
    match: /^data\/scripts\/actions\/objects\/daily_reward_shrine\.lua$/,
    status: "deferred",
    owner: "todo-14 Feature 54",
    reason: "daily reward schedule belongs to the world event engine",
  },
  {
    match: /^data\/scripts\/actions\/items\/(exercise_training_weapons|offline_training_book)\.lua$/,
    status: "deferred",
    owner: "todo-6 training",
    reason: "training systems are their own workstream",
  },
  {
    match: /^data\/scripts\/actions\/items\/wheel_scrolls\.lua$/,
    status: "deferred",
    owner: "todo-15 wheel",
    reason: "wheel scroll grants belong to the wheel workstream",
  },
  {
    match: /^data\/scripts\/actions\/items\/(store_coins|premium_scroll)\.lua$/,
    status: "deferred",
    owner: "todo-18 store",
    reason: "store-granted consumables belong to the store workstream",
  },
  {
    match: /^data\/scripts\/actions\/items\/(check_bless|blessing_charms)\.lua$/,
    status: "deferred",
    owner: "todo-15 Feature 72",
    reason: "blessings are not implemented yet",
  },
  {
    match: /hireling/,
    status: "excluded",
    owner: "todo-13",
    reason: "hirelings are out of scope for the rewrite",
  },
  {
    match: /(costume|outfit|mount|doll|figurine|balloon|firework|music_box|party_(hat|trumpet)|anniversary|christmas|surprise|present)/,
    status: "excluded",
    owner: "todo-13",
    reason: "cosmetic/event novelty item with no gameplay effect to reproduce",
  },
];

/**
 * Assigns one disposition to a parsed registration. Rules run in order:
 * explicit per-file dispositions, then structural rules (uid/aid/position
 * selectors and quest directories are storage-gated), then item-id coverage.
 * A registration matching nothing keeps status "unclassified", which the
 * parity test treats as a failure.
 */
export function classifyWorldActionRegistration(registration) {
  const path = registration.sourcePath;
  for (const disposition of FILE_DISPOSITIONS) {
    if (disposition.match.test(path)) {
      return {
        status: disposition.status,
        owner: disposition.owner,
        reason: disposition.reason,
      };
    }
  }
  // There is deliberately no "every id looks implemented" shortcut: a
  // registration only counts as implemented when its file is named above, so
  // a script that happens to reuse a covered id cannot claim parity it does
  // not have.
  if (
    registration.uids.length > 0 ||
    registration.aids.length > 0 ||
    registration.positionCount > 0 ||
    /\/(quests|world_changes|worldchanges)\//.test(path)
  ) {
    return {
      status: "deferred",
      owner: "todo-20 quest storage",
      reason:
        "selected by unique/action id or map position, so it is scripted quest content",
    };
  }
  if (registration.kind === "creature-event") {
    return {
      status: "deferred",
      owner: "todo-4 creatures",
      reason: "creature events belong to the creature/AI workstream",
    };
  }
  if (registration.kind === "movement") {
    return {
      status: "deferred",
      owner: "todo-13 Feature 50",
      reason: "step-in/step-out effect not yet reproduced",
    };
  }
  return {
    status: "deferred",
    owner: "todo-13 Feature 51",
    reason: "item-use effect not yet reproduced",
  };
}
