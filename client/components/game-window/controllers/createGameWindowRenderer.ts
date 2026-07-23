import type { GameClient } from "../../../lib/net/GameClient";
import { WorldRenderer } from "../../../lib/render/WorldRenderer";
import type { GameWindowStore } from "../types/GameWindowStore";
import { performMapLook } from "./performMapLook";

export function createGameWindowRenderer(
  store: GameWindowStore,
  getClient: () => GameClient | undefined,
  isDisposed: () => boolean,
): WorldRenderer {
  const runtime = store.getState().runtime;

  return new WorldRenderer({
    useMap: (position) => getClient()?.useMap(position),
    attackTarget: (creatureId) => {
      const creature = runtime.visibleCreaturesRef.current.find(
        (candidate) => candidate.id === creatureId,
      );
      if (creature?.kind === "npc") {
        getClient()?.greetNpc(creatureId);
        return;
      }
      getClient()?.attackTarget(creatureId);
    },
    cancelAttack: () => getClient()?.cancelAttack(),
    targetCreature: (creatureId) => {
      const action = runtime.pendingActionBarRef.current;
      if (action?.target === "creature") {
        if (action.awaitingResult) return true;
        const sent = getClient()?.activateActionBar(action.slotIndex, {
          kind: "creature",
          creatureId,
        });
        if (sent) {
          runtime.pendingActionBarRef.current = {
            ...action,
            awaitingResult: true,
          };
        }
        return true;
      }
      if (action) return false;
      const potion = runtime.pendingPotionRef.current;
      if (!potion) return false;
      const target = runtime.visibleCreaturesRef.current.find(
        (candidate) => candidate.id === creatureId,
      );
      if (
        creatureId !== store.getState().ownCharacter?.id &&
        target?.kind !== "player"
      ) {
        return true;
      }
      runtime.pendingPotionRef.current = null;
      store.getState().setPotionTargeting(false);
      getClient()?.usePotion(potion, creatureId);
      return true;
    },
    pickupMapItem: (item, position) => {
      const queued = store
        .getState()
        .sessionActions?.dispatchItemOpChecked({
          kind: "pickup",
          itemId: item.instanceId,
          revision: item.revision,
          position,
          ...(item.weight !== undefined
            ? { weight: item.weight * item.count }
            : {}),
        });
      if (queued) {
        runtime.rendererRef.current?.previewMapItemRemoval(
          position,
          item.instanceId,
        );
      }
    },
    beginMapItemDrag: (item, position) => {
      runtime.itemDragRef.current = { kind: "world", item, position };
    },
    endItemDrag: () => {
      runtime.itemDragRef.current = null;
    },
    dropDraggedItemOnCreature: (creatureId) => {
      const source = runtime.itemDragRef.current;
      if (source?.kind !== "owned") return false;
      const creature = runtime.visibleCreaturesRef.current.find(
        (candidate) => candidate.id === creatureId,
      );
      if (creature?.kind !== "player") return false;
      return (
        getClient()?.requestTrade(
          creatureId,
          source.item.id,
          source.item.revision,
        ) ?? false
      );
    },
    dropDraggedItem: (position) => {
      const source = runtime.itemDragRef.current;
      if (source?.kind === "owned") {
        const queued = store
          .getState()
          .sessionActions?.dispatchItemOpChecked({
            kind: "drop",
            itemId: source.item.id,
            position,
          });
        if (queued) {
          runtime.rendererRef.current?.previewMapItemAddition(position, {
            instanceId: source.item.id,
            itemId: source.item.clientId,
            revision: source.item.revision,
            count: source.item.count,
          });
        }
      } else if (
        source?.kind === "world" &&
        (source.position.x !== position.x ||
          source.position.y !== position.y ||
          source.position.z !== position.z)
      ) {
        const queued = store
          .getState()
          .sessionActions?.dispatchItemOpChecked({
            kind: "move-map",
            itemId: source.item.instanceId,
            revision: source.item.revision,
            fromPosition: source.position,
            toPosition: position,
          });
        if (queued) {
          runtime.rendererRef.current?.previewMapItemRemoval(
            source.position,
            source.item.instanceId,
          );
          runtime.rendererRef.current?.previewMapItemAddition(
            position,
            source.item,
          );
        }
      }
      runtime.itemDragRef.current = null;
    },
    autoWalk: (directions) => getClient()?.autoWalk(directions),
    worldLoadProgress: (completed, total) => {
      if (isDisposed()) return;
      store.getState().setWorldLoadProgress({ completed, total });
    },
    worldReady: () => {
      if (isDisposed()) return;
      store.getState().setWorldLoading(false);
    },
    targetPosition: (position) => {
      const action = runtime.pendingActionBarRef.current;
      if (action?.target === "creature") return true;
      if (action?.target === "position") {
        if (action.awaitingResult) return true;
        const sent = getClient()?.activateActionBar(action.slotIndex, {
          kind: "position",
          position,
        });
        if (sent) {
          runtime.pendingActionBarRef.current = {
            ...action,
            awaitingResult: true,
          };
        }
        return true;
      }
      const tool = runtime.pendingUseWithRef.current;
      if (tool) {
        runtime.pendingUseWithRef.current = null;
        store.getState().setUseWithTargeting(false);
        getClient()?.useItemWith(tool, position);
        return true;
      }
      const rune = runtime.pendingRuneRef.current;
      if (!rune) return false;
      runtime.pendingRuneRef.current = null;
      store.getState().setRuneTargeting(false);
      getClient()?.useRune(rune, { kind: "position", position });
      return true;
    },
    cancelUseWith: () => {
      if (runtime.pendingActionBarRef.current) {
        runtime.pendingActionBarRef.current = null;
        store.getState().setRuneTargeting(false);
        store.getState().setPotionTargeting(false);
        store.getState().setUseWithTargeting(false);
        return true;
      }
      if (!runtime.pendingUseWithRef.current) return false;
      runtime.pendingUseWithRef.current = null;
      store.getState().setUseWithTargeting(false);
      return true;
    },
    lookAt: (_position, creatureId, itemIds) =>
      performMapLook(store, creatureId, itemIds),
    openContextMenu: (screen, position, creatureId, itemIds) =>
      store
        .getState()
        .setMapContextMenu({ screen, position, creatureId, itemIds }),
  });
}
