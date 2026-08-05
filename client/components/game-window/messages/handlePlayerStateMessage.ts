import { GOLD_COIN_TYPE_ID } from "@tibia/protocol";
import type { ServerMessage } from "@tibia/protocol";
import { anchorFightStateCooldowns } from "../../../lib/combat/anchorFightStateCooldowns";
import type { GameWindowMessageContext } from "../types/GameWindowMessageContext";

export function handlePlayerStateMessage(
  message: ServerMessage,
  { store }: GameWindowMessageContext,
): boolean {
  const state = store.getState();
  if (message.type === "pong") {
    const roundTrip = Date.now() - message.nonce;
    // An implausible echo (clock jump, stale socket) is dropped, not shown.
    if (roundTrip >= 0 && roundTrip <= 60_000) {
      state.setLatencyMs(roundTrip);
    }
    return true;
  }
  if (message.type === "look-text") {
    // Tibia shows a look centred on the screen and in the server log; the text
    // is the server's, rendered verbatim.
    state.setCombatLog((current) => [...current, message.text].slice(-6));
    state.showScreenMessage(message.text, "look");
    return false;
  }

  const actions = state.sessionActions;
  if (!actions) return false;

  const { runtime } = state;

  if (message.type === "action-bar-activation-result") {
    const pending = runtime.pendingActionBarRef.current;
    if (!pending || pending.slotIndex !== message.slotIndex) return true;
    if (!message.accepted) {
      runtime.pendingActionBarRef.current = {
        ...pending,
        awaitingResult: false,
      };
      return true;
    }
    runtime.pendingActionBarRef.current = null;
    state.setRuneTargeting(false);
    state.setPotionTargeting(false);
    state.setUseWithTargeting(false);
    return true;
  }

  if (message.type === "action-bar-updated") {
    if (runtime.actionBarSaveTimerRef.current) return true;
    state.setActionBar(message.actionBar);
    runtime.actionBarRef.current = message.actionBar;
    return true;
  }

  if (message.type === "action-bot-updated") {
    if (runtime.actionBotSaveTimerRef.current) return true;
    state.setActionBotSettings(message.settings);
    runtime.actionBotSettingsRef.current = message.settings;
    return true;
  }

  if (message.type === "loot-filter-updated") {
    if (runtime.lootFilterSaveTimerRef.current) return true;
    state.setLootFilter(message.filter);
    runtime.lootFilterRef.current = message.filter;
    return true;
  }

  if (message.type === "hunting-bot-route") {
    // A save is still pending locally; the echo would revert the live edit.
    if (runtime.huntingBotSaveTimerRef.current) return true;
    state.setHuntingBotRoute(message.route);
    runtime.huntingBotRouteRef.current = message.route;
    return true;
  }

  if (message.type === "hunting-bot-status") {
    state.setHuntingBotError(null);
    state.setHuntingBotStatus({
      enabled: message.enabled,
      waypointIndex: message.waypointIndex,
      stopReason: message.stopReason,
    });
    return true;
  }

  if (message.type === "loot-filter-items") {
    state.setLootFilterItems({
      carried: message.carried,
      ignored: message.ignored,
    });
    return true;
  }

  if (message.type === "inventory-updated") {
    actions.inventory.confirm(message.inventory, message.nonce);
    state.setShopSession((current) =>
      current?.currencyItemTypeId === GOLD_COIN_TYPE_ID
        ? { ...current, pendingPurchaseCost: 0 }
        : current,
    );
    return true;
  }

  if (message.type === "item-text") {
    state.setItemText(message);
    return true;
  }

  if (message.type === "attack-target-changed") {
    state.setFightState((current) =>
      current ? { ...current, attackTargetId: message.creatureId } : current,
    );
    return false;
  }

  if (message.type === "follow-target-changed") {
    state.setFollowTargetId(message.creatureId);
    return false;
  }

  if (message.type === "combat-analyzer") {
    state.setCombatAnalyzer(message.analyzer);
    return false;
  }

  if (message.type === "fight-state") {
    state.setFightState(
      anchorFightStateCooldowns(message.fightState, Date.now()),
    );
    return false;
  }

  if (message.type === "combat-log") {
    state.setCombatLog((current) => [...current, message.text].slice(-6));
    // Status texts ("It is locked.", "Only the worthy may pass.") show
    // center-screen like Tibia, not only in the log.
    if (message.kind === "condition") {
      state.showScreenMessage(message.text, "status");
    }
    return false;
  }

  if (message.type === "creature-left") {
    state.setFightState((current) =>
      current?.attackTargetId === message.creatureId
        ? { ...current, attackTargetId: null }
        : current,
    );
    return false;
  }

  if (message.type === "progression-updated") {
    const previousLevel = runtime.confirmedLevelRef.current;
    runtime.confirmedLevelRef.current = {
      playerId: message.playerId,
      level: message.progression.level,
    };
    if (
      previousLevel?.playerId === message.playerId &&
      message.progression.level > previousLevel.level
    ) {
      runtime.levelUpSequenceRef.current += 1;
      state.setLevelUpNotice({
        id: runtime.levelUpSequenceRef.current,
        level: message.progression.level,
      });
    }
    state.setOwnCharacter((current) =>
      current?.id === message.playerId
        ? { ...current, ...message.progression }
        : current,
    );
    actions.inventory.patch((current) => ({
      ...current,
      capacityMax: message.progression.capacity,
    }));
    return true;
  }

  if (message.type === "vocation-updated") {
    state.setOwnCharacter((current) =>
      current?.id === message.playerId
        ? { ...current, vocation: message.vocation }
        : current,
    );
    state.setSpells(message.spells);
    return true;
  }

  // An own outfit change is broadcast as ordinary creature state; keep the
  // top-bar portrait's copy fresh and fall through to the renderer. Other
  // creatures' updates arrive at combat rates and must not touch the store.
  if (message.type === "creature-state-changed") {
    const { lookType, head, body, legs, feet, addons } =
      message.creature.outfit;
    if (lookType > 0 && message.creature.id === state.ownCharacter?.id) {
      state.setOwnCharacter((current) =>
        current?.id === message.creature.id
          ? { ...current, outfit: { lookType, head, body, legs, feet, addons } }
          : current,
      );
    }
    return false;
  }

  if (
    message.type === "creature-moved" ||
    message.type === "position-correction"
  ) {
    const playerId =
      message.type === "creature-moved"
        ? message.creatureId
        : message.playerId;
    if (playerId === state.ownCharacter?.id) {
      state.setOwnCharacter((current) =>
        current?.id === playerId
          ? {
              ...current,
              position: { ...message.position },
              direction: message.direction,
            }
          : current,
      );
    }
  }

  return false;
}
