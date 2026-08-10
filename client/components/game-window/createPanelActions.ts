import type { HotkeyAction } from "../../lib/hotkeys/keyBindings";
import type { GameWindowStore } from "./types/GameWindowStore";

export type PanelAction = Exclude<HotkeyAction, "toggleGameMenu">;

/**
 * The one place that knows how to open/close each game panel, including the
 * fetches some panels need on first open. Shared by the top navigation bar
 * and the keyboard hotkey dispatcher so both stay in sync. Handlers read the
 * store at call time, so the returned record is stable for a store instance.
 */
export function createPanelActions(
  store: GameWindowStore,
): Readonly<Record<PanelAction, () => void>> {
  const client = () => store.getState().runtime.clientRef.current;

  return {
    toggleCharacterStats: () => {
      const state = store.getState();
      state.setGameMenuOpen(false);
      if (state.characterStatsOpen) {
        state.setCharacterStatsOpen(false);
        state.setInventoryOpen(false);
        return;
      }
      state.setInventoryOpen(true);
      state.setCharacterStatsOpen(true);
    },
    toggleInventory: () => {
      const state = store.getState();
      state.setGameMenuOpen(false);
      if (state.characterStatsOpen) {
        state.setCharacterStatsOpen(false);
        state.setInventoryOpen(true);
        return;
      }
      state.setCharacterStatsOpen(false);
      state.setInventoryOpen((open) => !open);
    },
    toggleVipPanel: () => {
      const state = store.getState();
      state.setGameMenuOpen(false);
      if (state.vipPanelVisible) {
        state.setVipPanelVisible(false);
        return;
      }
      state.setPartyPanelVisible(false);
      state.setVipPanelVisible(true);
    },
    togglePartyPanel: () => {
      const state = store.getState();
      state.setGameMenuOpen(false);
      if (state.partyPanelVisible) {
        state.setPartyPanelVisible(false);
        return;
      }
      state.setVipPanelVisible(false);
      state.setPartyPanelVisible(true);
    },
    toggleGuildModal: () => {
      const state = store.getState();
      state.setGameMenuOpen(false);
      state.setInventoryOpen(false);
      state.setCharacterStatsOpen(false);
      state.setGuildModalOpen((open) => {
        if (!open) client()?.openGuild();
        return !open;
      });
    },
    toggleHouseModal: () => {
      const state = store.getState();
      state.setGameMenuOpen(false);
      state.setInventoryOpen(false);
      state.setCharacterStatsOpen(false);
      state.setGuildModalOpen(false);
      state.setHouseModalOpen((open) => {
        if (!open) {
          client()?.openHouse();
          if (!state.sessions?.house.list) {
            client()?.browseHouses(undefined, 0);
          }
        }
        return !open;
      });
    },
    toggleHighscores: () => {
      const state = store.getState();
      if (!state.sessionActions) return;
      state.setGameMenuOpen(false);
      state.setInventoryOpen(false);
      state.setCharacterStatsOpen(false);
      state.setHighscoresOpen((open) => {
        if (!open) {
          const sent =
            client()?.requestHighscores("experience", undefined, 0) ?? false;
          state.sessionActions?.highscores.begin(sent);
        }
        return !open;
      });
    },
    toggleWiki: () => {
      const state = store.getState();
      if (!state.sessionActions) return;
      state.setGameMenuOpen(false);
      state.setInventoryOpen(false);
      state.setCharacterStatsOpen(false);
      state.setWikiOpen((open) => {
        if (!open && !state.sessions?.bestiary.creatures) {
          const sent = client()?.requestBestiaryCreatures() ?? false;
          state.sessionActions?.bestiary.begin(sent);
        }
        return !open;
      });
    },
    toggleWheel: () => {
      const state = store.getState();
      if (!state.sessionActions) return;
      state.setGameMenuOpen(false);
      state.setInventoryOpen(false);
      state.setCharacterStatsOpen(false);
      state.setWikiOpen(false);
      state.setWheelOpen((open) => {
        if (!open && !state.sessions?.wheel.wheel) {
          const sent = client()?.requestWheel() ?? false;
          state.sessionActions?.wheel.begin(sent);
        }
        return !open;
      });
    },
    toggleForge: () => {
      const state = store.getState();
      if (!state.sessionActions) return;
      state.setGameMenuOpen(false);
      state.setInventoryOpen(false);
      state.setCharacterStatsOpen(false);
      state.setWikiOpen(false);
      state.setWheelOpen(false);
      state.setForgeOpen((open) => {
        if (!open && !state.sessions?.forge.state) {
          // Idempotent refresh; forge-state is also pushed at login.
          const sent = client()?.requestForge() ?? false;
          state.sessionActions?.forge.begin(sent);
        }
        return !open;
      });
    },
    toggleProficiency: () => {
      const state = store.getState();
      if (!state.sessionActions) return;
      state.setGameMenuOpen(false);
      state.setInventoryOpen(false);
      state.setCharacterStatsOpen(false);
      state.setWikiOpen(false);
      state.setWheelOpen(false);
      state.setForgeOpen(false);
      state.setProficiencyOpen((open) => {
        if (!open && !state.sessions?.proficiency.state) {
          // Idempotent refresh; proficiency-state is pushed at login.
          const sent = client()?.requestProficiencies() ?? false;
          state.sessionActions?.proficiency.begin(sent);
        }
        return !open;
      });
    },
    toggleTracker: () => {
      store.getState().setTrackerVisible((visible) => !visible);
    },
    toggleImbuementTracker: () => {
      // Timers come from the inventory the server already pushes; there is
      // nothing to fetch when the panel opens.
      store.getState().setImbuementTrackerVisible((visible) => !visible);
    },
    togglePrey: () => {
      const state = store.getState();
      state.setGameMenuOpen(false);
      state.setInventoryOpen(false);
      state.setCharacterStatsOpen(false);
      state.setHuntingTasksOpen(false);
      // No fetch: prey-state is pushed at login and after every change.
      state.setPreyWindowOpen((open) => !open);
    },
    toggleQuestLog: () => {
      const state = store.getState();
      state.setGameMenuOpen(false);
      state.setInventoryOpen(false);
      state.setCharacterStatsOpen(false);
      state.setQuestLogOpen((open) => {
        if (!open) {
          // The log is evaluated on demand from the owner's storages.
          client()?.requestQuestLog();
        }
        return !open;
      });
    },
    toggleHuntingTasks: () => {
      const state = store.getState();
      state.setGameMenuOpen(false);
      state.setInventoryOpen(false);
      state.setCharacterStatsOpen(false);
      state.setPreyWindowOpen(false);
      // No fetch: hunting-tasks-state is pushed like prey-state.
      state.setHuntingTasksOpen((open) => !open);
    },
    toggleHuntFinder: () => {
      const state = store.getState();
      if (!state.sessionActions) return;
      state.setGameMenuOpen(false);
      state.setInventoryOpen(false);
      state.setCharacterStatsOpen(false);
      state.setPreyWindowOpen(false);
      state.setHuntingTasksOpen(false);
      state.setHuntFinderOpen((open) => {
        if (!open && !state.sessions?.bestiary.creatures) {
          const sent = client()?.requestBestiaryCreatures() ?? false;
          state.sessionActions?.bestiary.begin(sent);
        }
        return !open;
      });
    },
    toggleOutfits: () => {
      const state = store.getState();
      if (!state.sessionActions) return;
      state.setGameMenuOpen(false);
      state.setInventoryOpen(false);
      state.setCharacterStatsOpen(false);
      state.setOutfitWindowOpen((open) => {
        if (!open) {
          // Idempotent refresh; the server also pushes state at login.
          const sent = client()?.getOutfits() ?? false;
          state.sessionActions?.outfit.begin(sent);
        }
        return !open;
      });
    },
    toggleProfile: () => {
      const state = store.getState();
      state.setGameMenuOpen(false);
      state.setInventoryOpen(false);
      state.setCharacterStatsOpen(false);
      // No fetch: profile-state is pushed at login and after changes.
      state.setProfileWindowOpen((open) => !open);
    },
    toggleBattleList: () => {
      store.getState().setBattleListVisible((visible) => !visible);
    },
    toggleMinimap: () => {
      store.getState().setMinimapVisible((visible) => !visible);
    },
    toggleStore: () => {
      const state = store.getState();
      if (state.storeOpen) {
        state.setStoreOpen(false);
        return;
      }
      state.setGameMenuOpen(false);
      state.setStoreSession((current) =>
        current
          ? { ...current, error: null, purchasedOfferId: null }
          : current,
      );
      state.setStoreOpen(true);
      const sent = client()?.openStore() ?? false;
      if (!sent) {
        state.setStoreSession({
          categories: [],
          home: [],
          categoryId: null,
          products: [],
          page: 0,
          pageCount: 1,
          selectedProductId: null,
          description: null,
          pending: false,
          pendingOfferId: null,
          purchasedOfferId: null,
          error: "unavailable",
        });
      }
    },
    toggleMarket: () => {
      const state = store.getState();
      state.setGameMenuOpen(false);
      state.setInventoryOpen(false);
      state.setCharacterStatsOpen(false);
      if (state.sessions?.market) {
        state.closeMarket();
        return;
      }
      client()?.openMarket(1);
    },
    openBugReport: () => {
      store.getState().setBugReportOpen(true);
    },
  };
}
