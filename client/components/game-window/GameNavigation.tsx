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
  const guildModalOpen = useGameWindowStore((state) => state.guildModalOpen);
  const houseModalOpen = useGameWindowStore((state) => state.houseModalOpen);
  const highscoresOpen = useGameWindowStore((state) => state.highscoresOpen);
  const wikiOpen = useGameWindowStore((state) => state.wikiOpen);
  const wheelOpen = useGameWindowStore((state) => state.wheelOpen);
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
  const setBattleListVisible = useGameWindowStore(
    (state) => state.setBattleListVisible,
  );
  const setMinimapVisible = useGameWindowStore(
    (state) => state.setMinimapVisible,
  );
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
        health={character.health}
        maxHealth={character.maxHealth}
        mana={character.mana}
        maxMana={character.maxMana}
        connectionStatus={status}
        fightMode={fightMode}
        battleListVisible={battleListVisible}
        minimapVisible={minimapVisible}
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
        onBattleList={() => setBattleListVisible((visible) => !visible)}
        onMinimap={() => setMinimapVisible((visible) => !visible)}
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
