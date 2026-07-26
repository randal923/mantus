import { countMoneyWorth } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { TopNavigationBar } from "../navigation/TopNavigationBar";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GameNavigation() {
  const { t } = useAppTranslation();
  const store = useGameWindowStoreApi();
  const runtime = store.getState().runtime;
  const character = useGameWindowStore((state) => state.ownCharacter);
  const status = useGameWindowStore((state) => state.status);
  const fightMode = useGameWindowStore(
    (state) => state.fightState?.mode ?? null,
  );
  const battleListVisible = useGameWindowStore(
    (state) => state.battleListVisible,
  );
  const minimapVisible = useGameWindowStore((state) => state.minimapVisible);
  const marketOpen = useGameWindowStore(
    (state) => Boolean(state.sessions?.market),
  );
  const inventory = useGameWindowStore(
    (state) => state.sessions?.inventory ?? null,
  );
  const mantusCoins = useGameWindowStore((state) => state.mantusCoins);
  const storeOpen = useGameWindowStore((state) => state.storeOpen);
  const guildModalOpen = useGameWindowStore((state) => state.guildModalOpen);
  const houseModalOpen = useGameWindowStore((state) => state.houseModalOpen);
  const highscoresOpen = useGameWindowStore((state) => state.highscoresOpen);
  const wikiOpen = useGameWindowStore((state) => state.wikiOpen);
  const wheelOpen = useGameWindowStore((state) => state.wheelOpen);
  const forgeOpen = useGameWindowStore((state) => state.forgeOpen);
  const proficiencyOpen = useGameWindowStore(
    (state) => state.proficiencyOpen,
  );
  const trackerVisible = useGameWindowStore((state) => state.trackerVisible);
  const preyWindowOpen = useGameWindowStore((state) => state.preyWindowOpen);
  const huntingTasksOpen = useGameWindowStore(
    (state) => state.huntingTasksOpen,
  );
  const outfitWindowOpen = useGameWindowStore(
    (state) => state.outfitWindowOpen,
  );
  const profileWindowOpen = useGameWindowStore(
    (state) => state.profileWindowOpen,
  );
  const vipPanelVisible = useGameWindowStore(
    (state) => state.vipPanelVisible,
  );
  const partyPanelVisible = useGameWindowStore(
    (state) => state.partyPanelVisible,
  );
  const characterStatsOpen = useGameWindowStore(
    (state) => state.characterStatsOpen,
  );
  const inventoryOpen = useGameWindowStore((state) => state.inventoryOpen);
  const houseListLoaded = useGameWindowStore(
    (state) => Boolean(state.sessions?.house.list),
  );
  const bestiaryLoaded = useGameWindowStore(
    (state) => Boolean(state.sessions?.bestiary.creatures),
  );
  const wheelLoaded = useGameWindowStore(
    (state) => Boolean(state.sessions?.wheel.wheel),
  );
  const forgeLoaded = useGameWindowStore(
    (state) => Boolean(state.sessions?.forge.state),
  );
  const proficiencyLoaded = useGameWindowStore(
    (state) => Boolean(state.sessions?.proficiency.state),
  );
  const sessionActions = useGameWindowStore((state) => state.sessionActions);
  const setGameMenuOpen = useGameWindowStore(
    (state) => state.setGameMenuOpen,
  );
  const setInventoryOpen = useGameWindowStore(
    (state) => state.setInventoryOpen,
  );
  const setCharacterStatsOpen = useGameWindowStore(
    (state) => state.setCharacterStatsOpen,
  );
  const setGuildModalOpen = useGameWindowStore(
    (state) => state.setGuildModalOpen,
  );
  const setHouseModalOpen = useGameWindowStore(
    (state) => state.setHouseModalOpen,
  );
  const setHighscoresOpen = useGameWindowStore(
    (state) => state.setHighscoresOpen,
  );
  const setWikiOpen = useGameWindowStore((state) => state.setWikiOpen);
  const setWheelOpen = useGameWindowStore((state) => state.setWheelOpen);
  const setForgeOpen = useGameWindowStore((state) => state.setForgeOpen);
  const setProficiencyOpen = useGameWindowStore(
    (state) => state.setProficiencyOpen,
  );
  const setTrackerVisible = useGameWindowStore(
    (state) => state.setTrackerVisible,
  );
  const setPreyWindowOpen = useGameWindowStore(
    (state) => state.setPreyWindowOpen,
  );
  const setHuntingTasksOpen = useGameWindowStore(
    (state) => state.setHuntingTasksOpen,
  );
  const setOutfitWindowOpen = useGameWindowStore(
    (state) => state.setOutfitWindowOpen,
  );
  const setProfileWindowOpen = useGameWindowStore(
    (state) => state.setProfileWindowOpen,
  );
  const setVipPanelVisible = useGameWindowStore(
    (state) => state.setVipPanelVisible,
  );
  const setPartyPanelVisible = useGameWindowStore(
    (state) => state.setPartyPanelVisible,
  );
  const setBattleListVisible = useGameWindowStore(
    (state) => state.setBattleListVisible,
  );
  const setMinimapVisible = useGameWindowStore(
    (state) => state.setMinimapVisible,
  );
  const setStoreOpen = useGameWindowStore((state) => state.setStoreOpen);
  const setStoreSession = useGameWindowStore((state) => state.setStoreSession);
  const closeMarket = useGameWindowStore((state) => state.closeMarket);
  if (!character || !sessionActions) return null;
  const activePanel = marketOpen
    ? "market"
    : guildModalOpen
      ? "guild"
      : houseModalOpen
        ? "house"
        : highscoresOpen
          ? "highscores"
          : wikiOpen
            ? "wiki"
            : wheelOpen
              ? "wheel"
              : forgeOpen
                ? "forge"
                : proficiencyOpen
                  ? "proficiency"
                  : preyWindowOpen
                    ? "prey"
                    : huntingTasksOpen
                      ? "huntingTasks"
                      : outfitWindowOpen
                        ? "outfit"
                        : profileWindowOpen
                          ? "profile"
                          : characterStatsOpen
                            ? "character"
                            : inventoryOpen
                              ? "inventory"
                              : undefined;

  return (
    <div className="absolute inset-x-0 top-0 z-40">
      <TopNavigationBar
        characterName={character.name}
        level={character.level}
        vocation={t(`vocations.${character.vocation}.name`)}
        outfit={character.outfit}
        connectionStatus={status}
        fightMode={fightMode}
        battleListVisible={battleListVisible}
        minimapVisible={minimapVisible}
        trackerVisible={trackerVisible}
        vipVisible={vipPanelVisible}
        partyVisible={partyPanelVisible}
        gold={inventory ? countMoneyWorth(inventory) : 0}
        mantusCoins={mantusCoins}
        storeOpen={storeOpen}
        activePanel={activePanel}
        onCharacter={() => {
          setGameMenuOpen(false);
          if (characterStatsOpen) {
            setCharacterStatsOpen(false);
            setInventoryOpen(false);
            return;
          }
          setInventoryOpen(true);
          setCharacterStatsOpen(true);
        }}
        onInventory={() => {
          setGameMenuOpen(false);
          if (characterStatsOpen) {
            setCharacterStatsOpen(false);
            setInventoryOpen(true);
            return;
          }
          setCharacterStatsOpen(false);
          setInventoryOpen((open) => !open);
        }}
        onVip={() => {
          setGameMenuOpen(false);
          if (vipPanelVisible) {
            setVipPanelVisible(false);
            return;
          }
          setPartyPanelVisible(false);
          setVipPanelVisible(true);
        }}
        onParty={() => {
          setGameMenuOpen(false);
          if (partyPanelVisible) {
            setPartyPanelVisible(false);
            return;
          }
          setVipPanelVisible(false);
          setPartyPanelVisible(true);
        }}
        onGuild={() => {
          setGameMenuOpen(false);
          setInventoryOpen(false);
          setCharacterStatsOpen(false);
          setGuildModalOpen((open) => {
            if (!open) runtime.clientRef.current?.openGuild();
            return !open;
          });
        }}
        onHouse={() => {
          setGameMenuOpen(false);
          setInventoryOpen(false);
          setCharacterStatsOpen(false);
          setGuildModalOpen(false);
          setHouseModalOpen((open) => {
            if (!open) {
              runtime.clientRef.current?.openHouse();
              if (!houseListLoaded) {
                runtime.clientRef.current?.browseHouses(undefined, 0);
              }
            }
            return !open;
          });
        }}
        onHighscores={() => {
          setGameMenuOpen(false);
          setInventoryOpen(false);
          setCharacterStatsOpen(false);
          setHighscoresOpen((open) => {
            if (!open) {
              const sent =
                runtime.clientRef.current?.requestHighscores(
                  "experience",
                  undefined,
                  0,
                ) ?? false;
              sessionActions.highscores.begin(sent);
            }
            return !open;
          });
        }}
        onWiki={() => {
          setGameMenuOpen(false);
          setInventoryOpen(false);
          setCharacterStatsOpen(false);
          setWikiOpen((open) => {
            if (!open && !bestiaryLoaded) {
              const sent =
                runtime.clientRef.current?.requestBestiaryCreatures() ?? false;
              sessionActions.bestiary.begin(sent);
            }
            return !open;
          });
        }}
        onWheel={() => {
          setGameMenuOpen(false);
          setInventoryOpen(false);
          setCharacterStatsOpen(false);
          setWikiOpen(false);
          setWheelOpen((open) => {
            if (!open && !wheelLoaded) {
              const sent = runtime.clientRef.current?.requestWheel() ?? false;
              sessionActions.wheel.begin(sent);
            }
            return !open;
          });
        }}
        onForge={() => {
          setGameMenuOpen(false);
          setInventoryOpen(false);
          setCharacterStatsOpen(false);
          setWikiOpen(false);
          setWheelOpen(false);
          setForgeOpen((open) => {
            if (!open && !forgeLoaded) {
              // Idempotent refresh; forge-state is also pushed at login.
              const sent = runtime.clientRef.current?.requestForge() ?? false;
              sessionActions.forge.begin(sent);
            }
            return !open;
          });
        }}
        onProficiency={() => {
          setGameMenuOpen(false);
          setInventoryOpen(false);
          setCharacterStatsOpen(false);
          setWikiOpen(false);
          setWheelOpen(false);
          setForgeOpen(false);
          setProficiencyOpen((open) => {
            if (!open && !proficiencyLoaded) {
              // Idempotent refresh; proficiency-state is pushed at login.
              const sent =
                runtime.clientRef.current?.requestProficiencies() ?? false;
              sessionActions.proficiency.begin(sent);
            }
            return !open;
          });
        }}
        onTracker={() => setTrackerVisible((visible) => !visible)}
        onPrey={() => {
          setGameMenuOpen(false);
          setInventoryOpen(false);
          setCharacterStatsOpen(false);
          setHuntingTasksOpen(false);
          // No fetch: prey-state is pushed at login and after every change.
          setPreyWindowOpen((open) => !open);
        }}
        onHuntingTasks={() => {
          setGameMenuOpen(false);
          setInventoryOpen(false);
          setCharacterStatsOpen(false);
          setPreyWindowOpen(false);
          // No fetch: hunting-tasks-state is pushed like prey-state.
          setHuntingTasksOpen((open) => !open);
        }}
        onOutfits={() => {
          setGameMenuOpen(false);
          setInventoryOpen(false);
          setCharacterStatsOpen(false);
          setOutfitWindowOpen((open) => {
            if (!open) {
              // Idempotent refresh; the server also pushes state at login.
              const sent = runtime.clientRef.current?.getOutfits() ?? false;
              sessionActions.outfit.begin(sent);
            }
            return !open;
          });
        }}
        onProfile={() => {
          setGameMenuOpen(false);
          setInventoryOpen(false);
          setCharacterStatsOpen(false);
          // No fetch: profile-state is pushed at login and after changes.
          setProfileWindowOpen((open) => !open);
        }}
        onBattleList={() => setBattleListVisible((visible) => !visible)}
        onMinimap={() => setMinimapVisible((visible) => !visible)}
        onStore={() => {
          if (storeOpen) {
            setStoreOpen(false);
            return;
          }
          setGameMenuOpen(false);
          setStoreSession((current) =>
            current
              ? { ...current, error: null, purchasedOfferId: null }
              : current,
          );
          setStoreOpen(true);
          const sent = runtime.clientRef.current?.openStore() ?? false;
          if (!sent) {
            setStoreSession({
              categories: [],
              pending: false,
              pendingOfferId: null,
              purchasedOfferId: null,
              error: "unavailable",
            });
          }
        }}
        onFightModeChange={(mode) =>
          runtime.clientRef.current?.setFightMode(mode)
        }
        onMarket={() => {
          setGameMenuOpen(false);
          setInventoryOpen(false);
          setCharacterStatsOpen(false);
          if (marketOpen) {
            closeMarket();
            return;
          }
          runtime.clientRef.current?.openMarket(1);
        }}
        onSettings={() => {
          setInventoryOpen(false);
          setCharacterStatsOpen(false);
          setGameMenuOpen(true);
        }}
      />
    </div>
  );
}
