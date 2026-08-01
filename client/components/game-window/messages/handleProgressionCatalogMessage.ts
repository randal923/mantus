import type { ServerMessage } from "@tibia/protocol";
import { warmOutfitAnimationCache } from "../../../lib/render/warmOutfitAnimationCache";
import type { GameWindowMessageContext } from "../types/GameWindowMessageContext";

const OUTFIT_WARM_DELAY_MS = 10_000;

export function handleProgressionCatalogMessage(
  message: ServerMessage,
  { store }: GameWindowMessageContext,
): boolean {
  const actions = store.getState().sessionActions;
  if (!actions) return false;

  if (message.type === "highscores-state") {
    actions.highscores.stateReceived(message);
    return true;
  }

  if (message.type === "bestiary-creatures-state") {
    actions.bestiary.creaturesReceived(message);
    const outfits = message.entries.map((entry) => entry.outfit);
    window.setTimeout(
      () => warmOutfitAnimationCache(outfits),
      OUTFIT_WARM_DELAY_MS,
    );
    return true;
  }

  if (message.type === "bestiary-monster-state") {
    actions.bestiary.monsterReceived(message);
    return true;
  }

  if (message.type === "bosstiary-state") {
    actions.bosstiary.stateReceived(message);
    const outfits = message.entries.map((entry) => entry.outfit);
    window.setTimeout(
      () => warmOutfitAnimationCache(outfits),
      OUTFIT_WARM_DELAY_MS,
    );
    return true;
  }

  if (message.type === "bosstiary-boss-state") {
    actions.bosstiary.bossReceived(message);
    return true;
  }

  if (message.type === "wiki-item-sources-state") {
    actions.bestiary.itemSourcesReceived(message);
    const outfits = message.sources.map((source) => source.outfit);
    window.setTimeout(
      () => warmOutfitAnimationCache(outfits),
      OUTFIT_WARM_DELAY_MS,
    );
    return true;
  }

  if (message.type === "bestiary-entry-changed") {
    actions.bestiary.entryChanged(message);
    actions.bosstiary.entryChanged(message);
    actions.tracker.entryChanged(message);
    return true;
  }

  // Pushed at login and again on each daily rotation; never requested.
  if (message.type === "boosted-state") {
    actions.boosted.stateReceived(message);
    return true;
  }

  // Pushed at login and after every tracker-set mutation.
  if (message.type === "tracker-state") {
    actions.tracker.stateReceived(message);
    return true;
  }

  if (message.type === "boss-slots-state") {
    actions.bossSlots.stateReceived(message);
    return true;
  }

  if (message.type === "boss-slot-failed") {
    actions.bossSlots.fail(message.reason);
    return true;
  }

  if (message.type === "forge-state") {
    actions.forge.stateReceived(message);
    return true;
  }

  if (message.type === "forge-result") {
    actions.forge.resultReceived(message);
    return true;
  }

  if (message.type === "forge-history-state") {
    actions.forge.historyReceived(message);
    return true;
  }

  if (message.type === "forge-action-failed") {
    actions.forge.fail(message.reason);
    return true;
  }

  if (message.type === "imbuement-window-state") {
    actions.imbuement.windowReceived(message);
    store.getState().setBankBalance(message.bankBalance);
    // Using a shrine pushes this unprompted, so the window opens itself; the
    // item id follows the server's view of what is picked.
    store.getState().setImbuementOpen(true);
    store.getState().setImbuementItemId(message.itemId);
    return true;
  }

  if (message.type === "imbuement-action-failed") {
    actions.imbuement.fail(message.reason);
    return true;
  }

  // Pushed at login, after kills that change progress, and after selects.
  if (message.type === "proficiency-state") {
    actions.proficiency.stateReceived(message);
    return true;
  }

  if (message.type === "proficiency-action-failed") {
    actions.proficiency.fail(message.reason);
    return true;
  }

  // Pushed at login and on grants; never requested.
  if (message.type === "animus-state") {
    actions.animus.stateReceived(message);
    return true;
  }

  if (message.type === "cyclopedia-combat-state") {
    actions.cyclopedia.combatReceived(message);
    return true;
  }

  if (message.type === "cyclopedia-deaths-state") {
    actions.cyclopedia.deathsReceived(message);
    return true;
  }

  if (message.type === "cyclopedia-pvp-kills-state") {
    actions.cyclopedia.pvpKillsReceived(message);
    return true;
  }

  if (message.type === "cyclopedia-item-summary-state") {
    actions.cyclopedia.itemSummaryReceived(message);
    return true;
  }

  if (message.type === "cyclopedia-action-failed") {
    actions.cyclopedia.fail(message.reason);
    return true;
  }

  if (message.type === "wheel-state") {
    actions.wheel.stateReceived(message);
    return true;
  }

  if (message.type === "wheel-action-failed") {
    actions.wheel.fail(message.reason);
    return true;
  }

  if (message.type === "wheel-gems-state") {
    actions.gems.stateReceived(message);
    return true;
  }

  if (message.type === "wheel-gem-failed") {
    actions.gems.fail(message.reason);
    return true;
  }

  // Pushed at login and after every prey/task mutation; never requested.
  if (message.type === "prey-state") {
    actions.prey.stateReceived(message);
    return true;
  }

  if (message.type === "prey-action-failed") {
    actions.prey.fail(message.reason);
    return true;
  }

  if (message.type === "hunting-tasks-state") {
    actions.huntingTasks.stateReceived(message);
    return true;
  }

  if (message.type === "hunting-task-action-failed") {
    actions.huntingTasks.fail(message.reason);
    return true;
  }

  if (message.type === "bestiary-action-failed") {
    actions.bestiary.fail(message.reason);
    actions.bosstiary.fail(message.reason);
    return true;
  }

  if (message.type === "highscores-action-failed") {
    actions.highscores.fail(message.reason);
    return true;
  }

  return false;
}
