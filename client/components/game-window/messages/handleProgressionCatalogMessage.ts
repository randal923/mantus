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
