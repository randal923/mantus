import { useCallback, useLayoutEffect, useMemo } from "react";
import type { DepotStateMessage, InventoryState } from "@tibia/protocol";
import { useBestiarySession } from "../../../hooks/useBestiarySession";
import { useBoostedSession } from "../../../hooks/useBoostedSession";
import { useBossSlotsSession } from "../../../hooks/useBossSlotsSession";
import { useBosstiarySession } from "../../../hooks/useBosstiarySession";
import { useDepotSession } from "../../../hooks/useDepotSession";
import { useForgeSession } from "../../../hooks/useForgeSession";
import { useImbuementSession } from "../../../hooks/useImbuementSession";
import { useGemSession } from "../../../hooks/useGemSession";
import { useGuildSession } from "../../../hooks/useGuildSession";
import { useHighscoresSession } from "../../../hooks/useHighscoresSession";
import { useHouseSession } from "../../../hooks/useHouseSession";
import { useHuntingTasksSession } from "../../../hooks/useHuntingTasksSession";
import { useMarketSession } from "../../../hooks/useMarketSession";
import { useOptimisticInventory } from "../../../hooks/useOptimisticInventory";
import { useOutfitSession } from "../../../hooks/useOutfitSession";
import { usePartySession } from "../../../hooks/usePartySession";
import { usePreySession } from "../../../hooks/usePreySession";
import { useProfileSession } from "../../../hooks/useProfileSession";
import { useTradeSession } from "../../../hooks/useTradeSession";
import { useTrackerSession } from "../../../hooks/useTrackerSession";
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
      const state = store.getState();
      const character = state.ownCharacter;
      const viewRange = state.runtime.rendererRef.current?.getViewRange();
      return character
        ? validateItemOp(op, projected, character, viewRange)
        : null;
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
  const outfit = useOutfitSession();
  const profile = useProfileSession();
  const prey = usePreySession();
  const huntingTasks = useHuntingTasksSession();
  const boosted = useBoostedSession();
  const tracker = useTrackerSession();
  const bossSlots = useBossSlotsSession();
  const forge = useForgeSession();
  const imbuement = useImbuementSession();

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
        analyzerReceived: party.analyzerReceived,
        finderReceived: party.finderReceived,
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
        friendStateReceived: vip.friendStateReceived,
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
      outfit: {
        stateReceived: outfit.stateReceived,
        begin: outfit.begin,
        fail: outfit.fail,
        reset: outfit.reset,
      },
      profile: {
        stateReceived: profile.stateReceived,
        publicProfileReceived: profile.publicProfileReceived,
        clearPublicProfile: profile.clearPublicProfile,
        begin: profile.begin,
        fail: profile.fail,
        dismissError: profile.dismissError,
        reset: profile.reset,
      },
      prey: {
        stateReceived: prey.stateReceived,
        begin: prey.begin,
        fail: prey.fail,
        dismissError: prey.dismissError,
        reset: prey.reset,
      },
      huntingTasks: {
        stateReceived: huntingTasks.stateReceived,
        begin: huntingTasks.begin,
        fail: huntingTasks.fail,
        dismissError: huntingTasks.dismissError,
        reset: huntingTasks.reset,
      },
      boosted: {
        stateReceived: boosted.stateReceived,
        reset: boosted.reset,
      },
      tracker: {
        stateReceived: tracker.stateReceived,
        entryChanged: tracker.entryChanged,
        reset: tracker.reset,
      },
      bossSlots: {
        stateReceived: bossSlots.stateReceived,
        begin: bossSlots.begin,
        fail: bossSlots.fail,
        dismissError: bossSlots.dismissError,
        reset: bossSlots.reset,
      },
      forge: {
        stateReceived: forge.stateReceived,
        historyReceived: forge.historyReceived,
        resultReceived: forge.resultReceived,
        begin: forge.begin,
        fail: forge.fail,
        dismissError: forge.dismissError,
        dismissResult: forge.dismissResult,
        reset: forge.reset,
      },
      imbuement: {
        windowReceived: imbuement.windowReceived,
        begin: imbuement.begin,
        fail: imbuement.fail,
        dismissError: imbuement.dismissError,
        reset: imbuement.reset,
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
      boosted.reset,
      boosted.stateReceived,
      bossSlots.begin,
      bossSlots.dismissError,
      bossSlots.fail,
      bossSlots.reset,
      bossSlots.stateReceived,
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
      forge.begin,
      forge.dismissError,
      forge.dismissResult,
      forge.fail,
      forge.historyReceived,
      forge.reset,
      forge.resultReceived,
      forge.stateReceived,
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
      huntingTasks.begin,
      huntingTasks.dismissError,
      huntingTasks.fail,
      huntingTasks.reset,
      huntingTasks.stateReceived,
      imbuement.begin,
      imbuement.dismissError,
      imbuement.fail,
      imbuement.reset,
      imbuement.windowReceived,
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
      outfit.begin,
      outfit.fail,
      outfit.reset,
      outfit.stateReceived,
      party.begin,
      party.dismissError,
      party.fail,
      party.invitationReceived,
      party.invitationRevoked,
      party.reset,
      party.stateReceived,
      party.analyzerReceived,
      party.finderReceived,
      prey.begin,
      prey.dismissError,
      prey.fail,
      prey.reset,
      prey.stateReceived,
      profile.begin,
      profile.clearPublicProfile,
      profile.dismissError,
      profile.fail,
      profile.publicProfileReceived,
      profile.reset,
      profile.stateReceived,
      tracker.entryChanged,
      tracker.reset,
      tracker.stateReceived,
      trade.begin,
      trade.fail,
      trade.reset,
      trade.stateReceived,
      vip.begin,
      vip.dismissError,
      vip.fail,
      vip.friendStateReceived,
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
        outfit: outfit.state,
        profile: profile.state,
        prey: prey.state,
        huntingTasks: huntingTasks.state,
        boosted: boosted.state,
        tracker: tracker.state,
        bossSlots: bossSlots.state,
        forge: forge.state,
        imbuement: imbuement.state,
      },
      sessionActions,
    );
  }, [
    bestiary.state,
    boosted.state,
    bossSlots.state,
    bosstiary.state,
    depot.session,
    forge.state,
    imbuement.state,
    gems.state,
    guild.state,
    highscores.state,
    house.state,
    huntingTasks.state,
    market.session,
    optimisticInventory.inventory,
    outfit.state,
    party.state,
    prey.state,
    profile.state,
    sessionActions,
    store,
    tracker.state,
    trade.session,
    vip.state,
    wheel.state,
  ]);

  return null;
}
