import { GOLD_COIN_TYPE_ID } from "@tibia/protocol";
import type { ServerMessage } from "@tibia/protocol";
import type { GameWindowMessageContext } from "../types/GameWindowMessageContext";

export function handlePlayerStateMessage(
  message: ServerMessage,
  { store }: GameWindowMessageContext,
): boolean {
  const state = store.getState();
  const actions = state.sessionActions;
  if (!actions) return false;

  const { runtime } = state;

  if (message.type === "inventory-updated") {
    actions.inventory.confirm(message.inventory);
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

  if (message.type === "fight-state") {
    state.setFightState(message.fightState);
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

  if (
    message.type === "creature-moved" ||
    message.type === "position-correction"
  ) {
    const playerId =
      message.type === "creature-moved"
        ? message.creatureId
        : message.playerId;
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

  return false;
}
