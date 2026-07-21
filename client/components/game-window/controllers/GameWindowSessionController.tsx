import { useCallback, useLayoutEffect, useMemo } from "react";
import type { DepotStateMessage, InventoryState } from "@tibia/protocol";
import { useBestiarySession } from "../../../hooks/useBestiarySession";
import { useBosstiarySession } from "../../../hooks/useBosstiarySession";
import { useDepotSession } from "../../../hooks/useDepotSession";
import { useGemSession } from "../../../hooks/useGemSession";
import { useGuildSession } from "../../../hooks/useGuildSession";
import { useHighscoresSession } from "../../../hooks/useHighscoresSession";
import { useHouseSession } from "../../../hooks/useHouseSession";
import { useMarketSession } from "../../../hooks/useMarketSession";
import { useOptimisticInventory } from "../../../hooks/useOptimisticInventory";
import { usePartySession } from "../../../hooks/usePartySession";
import { useTradeSession } from "../../../hooks/useTradeSession";
import { useVipSession } from "../../../hooks/useVipSession";
import { useWheelSession } from "../../../hooks/useWheelSession";
import { i18n } from "../../../i18n/i18n";
import type { DepotAction } from "../../../lib/depot/DepotAction";
import type {
  PendingItemOp,
  PendingItemOpIntent,
} from "../../../lib/inventory/PendingItemOp";
import { validateItemOp } from "../../../lib/inventory/validateItemOp";
import type { GameWindowSessionActions } from "../types/GameWindowSessionActions";
import { useGameWindowStoreApi } from "../store/useGameWindowStoreApi";

export function GameWindowSessionController() {
  const store = useGameWindowStoreApi();
  const sendItemIntent = useCallback(
    (intent: PendingItemOpIntent) =>
      store.getState().runtime.clientRef.current?.sendItemIntent(intent) ??
      false,
    [store],
  );
  const discardStaleMapPreviews = useCallback(
    (op: PendingItemOp) => {
      if (
        op.kind === "drop" ||
        op.kind === "pickup" ||
        op.kind === "move-map"
      ) {
        store.getState().runtime.rendererRef.current?.clearMapItemPreviews();
      }
    },
    [store],
  );
  const validateItemOpLocally = useCallback(
    (op: PendingItemOp, projected: InventoryState) => {
      const character = store.getState().ownCharacter;
      return character ? validateItemOp(op, projected, character) : null;
    },
    [store],
  );
  const optimisticInventory = useOptimisticInventory(
    sendItemIntent,
    discardStaleMapPreviews,
    validateItemOpLocally,
  );
  const dispatchItemOp = optimisticInventory.dispatch;
  const getConfirmedItem = optimisticInventory.getConfirmedItem;
  const dispatchItemOpChecked = useCallback(
    (op: PendingItemOp): boolean => {
      const rejection = dispatchItemOp(op);
      if (!rejection) return true;
      store
        .getState()
        .setCombatLog((current) =>
          [...current, i18n.t(`inventory.rejections.${rejection}`)].slice(-6),
        );
      return false;
    },
    [dispatchItemOp, store],
  );
  const sendDepotAction = useCallback(
    (action: DepotAction, state: DepotStateMessage): boolean => {
      const client = store.getState().runtime.clientRef.current;
      if (action.kind === "deposit") {
        const item = getConfirmedItem(action.item.id);
        return item
          ? (client?.depositInDepot(state, item) ?? false)
          : false;
      }
      if (action.kind === "withdraw") {
        return client?.withdrawFromDepot(state, action.entry) ?? false;
      }
      if (action.kind === "stash-deposit") {
        const item = getConfirmedItem(action.item.id);
        return item
          ? (client?.depositInStash(state, item, action.count) ?? false)
          : false;
      }
      return (
        client?.withdrawFromStash(
          state,
          action.entry.itemTypeId,
          action.count,
        ) ?? false
      );
    },
    [getConfirmedItem, store],
  );
  const depot = useDepotSession(sendDepotAction);
  const market = useMarketSession();
  const trade = useTradeSession();
  const party = usePartySession();
  const guild = useGuildSession();
  const house = useHouseSession();
  const vip = useVipSession();
  const highscores = useHighscoresSession();
  const bestiary = useBestiarySession();
  const bosstiary = useBosstiarySession();
  const wheel = useWheelSession();
  const gems = useGemSession();

  const sessionActions = useMemo<GameWindowSessionActions>(
    () => ({
      inventory: {
        reset: optimisticInventory.reset,
        confirm: optimisticInventory.confirm,
        rollback: optimisticInventory.rollback,
        patch: optimisticInventory.patch,
        preview: optimisticInventory.preview,
        rejectPreview: optimisticInventory.rejectPreview,
        clearPreviews: optimisticInventory.clearPreviews,
        getConfirmedItem: optimisticInventory.getConfirmedItem,
        dispatch: optimisticInventory.dispatch,
      },
      depot: {
        confirm: depot.confirm,
        fail: depot.fail,
        beginBrowse: depot.beginBrowse,
        enqueue: depot.enqueue,
        reject: depot.reject,
        close: depot.close,
        reset: depot.reset,
      },
      market: {
        opened: market.opened,
        offersReceived: market.offersReceived,
        ownOffersReceived: market.ownOffersReceived,
        historyReceived: market.historyReceived,
        transacted: market.transacted,
        fail: market.fail,
        begin: market.begin,
        reset: market.reset,
      },
      trade: {
        stateReceived: trade.stateReceived,
        fail: trade.fail,
        begin: trade.begin,
        reset: trade.reset,
      },
      party: {
        stateReceived: party.stateReceived,
        invitationReceived: party.invitationReceived,
        invitationRevoked: party.invitationRevoked,
        fail: party.fail,
        begin: party.begin,
        dismissError: party.dismissError,
        reset: party.reset,
      },
      guild: {
        stateReceived: guild.stateReceived,
        invitationReceived: guild.invitationReceived,
        begin: guild.begin,
        fail: guild.fail,
        dismissError: guild.dismissError,
        reset: guild.reset,
      },
      house: {
        stateReceived: house.stateReceived,
        listReceived: house.listReceived,
        offerReceived: house.offerReceived,
        offerResolved: house.offerResolved,
        offerCancelledByName: house.offerCancelledByName,
        begin: house.begin,
        fail: house.fail,
        dismissError: house.dismissError,
        reset: house.reset,
      },
      vip: {
        stateReceived: vip.stateReceived,
        statusChanged: vip.statusChanged,
        begin: vip.begin,
        fail: vip.fail,
        dismissError: vip.dismissError,
        reset: vip.reset,
      },
      highscores: {
        stateReceived: highscores.stateReceived,
        begin: highscores.begin,
        fail: highscores.fail,
        reset: highscores.reset,
      },
      bestiary: {
        creaturesReceived: bestiary.creaturesReceived,
        monsterReceived: bestiary.monsterReceived,
        itemSourcesReceived: bestiary.itemSourcesReceived,
        entryChanged: bestiary.entryChanged,
        begin: bestiary.begin,
        beginSources: bestiary.beginSources,
        fail: bestiary.fail,
        reset: bestiary.reset,
      },
      bosstiary: {
        stateReceived: bosstiary.stateReceived,
        bossReceived: bosstiary.bossReceived,
        entryChanged: bosstiary.entryChanged,
        begin: bosstiary.begin,
        fail: bosstiary.fail,
        reset: bosstiary.reset,
      },
      wheel: {
        stateReceived: wheel.stateReceived,
        begin: wheel.begin,
        fail: wheel.fail,
        reset: wheel.reset,
      },
      gems: {
        stateReceived: gems.stateReceived,
        begin: gems.begin,
        fail: gems.fail,
        reset: gems.reset,
      },
      dispatchItemOpChecked,
    }),
    [
      bestiary.begin,
      bestiary.beginSources,
      bestiary.creaturesReceived,
      bestiary.entryChanged,
      bestiary.fail,
      bestiary.itemSourcesReceived,
      bestiary.monsterReceived,
      bestiary.reset,
      bosstiary.begin,
      bosstiary.bossReceived,
      bosstiary.entryChanged,
      bosstiary.fail,
      bosstiary.reset,
      bosstiary.stateReceived,
      depot.beginBrowse,
      depot.close,
      depot.confirm,
      depot.enqueue,
      depot.fail,
      depot.reject,
      depot.reset,
      dispatchItemOpChecked,
      gems.begin,
      gems.fail,
      gems.reset,
      gems.stateReceived,
      guild.begin,
      guild.dismissError,
      guild.fail,
      guild.invitationReceived,
      guild.reset,
      guild.stateReceived,
      highscores.begin,
      highscores.fail,
      highscores.reset,
      highscores.stateReceived,
      house.begin,
      house.dismissError,
      house.fail,
      house.listReceived,
      house.offerCancelledByName,
      house.offerReceived,
      house.offerResolved,
      house.reset,
      house.stateReceived,
      market.begin,
      market.fail,
      market.historyReceived,
      market.offersReceived,
      market.opened,
      market.ownOffersReceived,
      market.reset,
      market.transacted,
      optimisticInventory.clearPreviews,
      optimisticInventory.confirm,
      optimisticInventory.dispatch,
      optimisticInventory.getConfirmedItem,
      optimisticInventory.patch,
      optimisticInventory.preview,
      optimisticInventory.rejectPreview,
      optimisticInventory.reset,
      optimisticInventory.rollback,
      party.begin,
      party.dismissError,
      party.fail,
      party.invitationReceived,
      party.invitationRevoked,
      party.reset,
      party.stateReceived,
      trade.begin,
      trade.fail,
      trade.reset,
      trade.stateReceived,
      vip.begin,
      vip.dismissError,
      vip.fail,
      vip.reset,
      vip.stateReceived,
      vip.statusChanged,
      wheel.begin,
      wheel.fail,
      wheel.reset,
      wheel.stateReceived,
    ],
  );

  useLayoutEffect(() => {
    store.getState().bindSessions(
      {
        inventory: optimisticInventory.inventory,
        depot: depot.session,
        market: market.session,
        trade: trade.session,
        party: party.state,
        guild: guild.state,
        house: house.state,
        vip: vip.state,
        highscores: highscores.state,
        bestiary: bestiary.state,
        bosstiary: bosstiary.state,
        wheel: wheel.state,
        gems: gems.state,
      },
      sessionActions,
    );
  }, [
    bestiary.state,
    bosstiary.state,
    depot.session,
    gems.state,
    guild.state,
    highscores.state,
    house.state,
    market.session,
    optimisticInventory.inventory,
    party.state,
    sessionActions,
    store,
    trade.session,
    vip.state,
    wheel.state,
  ]);

  return null;
}
