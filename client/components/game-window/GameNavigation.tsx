import { useMemo } from "react";
import { countMoneyWorth } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { TopNavigationBar } from "../navigation/TopNavigationBar";
import { createPanelActions } from "./createPanelActions";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GameNavigation() {
  const { t } = useAppTranslation();
  const store = useGameWindowStoreApi();
  const runtime = store.getState().runtime;
  const panelActions = useMemo(() => createPanelActions(store), [store]);
  const character = useGameWindowStore((state) => state.ownCharacter);
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
  const bankBalance = useGameWindowStore((state) => state.bankBalance);
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
  const imbuementTrackerVisible = useGameWindowStore(
    (state) => state.imbuementTrackerVisible,
  );
  const preyWindowOpen = useGameWindowStore((state) => state.preyWindowOpen);
  const questLogOpen = useGameWindowStore((state) => state.questLogOpen);
  const huntingTasksOpen = useGameWindowStore(
    (state) => state.huntingTasksOpen,
  );
  const huntFinderOpen = useGameWindowStore((state) => state.huntFinderOpen);
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
  const sessionActions = useGameWindowStore((state) => state.sessionActions);
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
                  : questLogOpen
                    ? "quests"
                    : preyWindowOpen
                      ? "prey"
                      : huntingTasksOpen
                        ? "huntingTasks"
                        : huntFinderOpen
                          ? "huntFinder"
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
        fightMode={fightMode}
        battleListVisible={battleListVisible}
        minimapVisible={minimapVisible}
        trackerVisible={trackerVisible}
        imbuementTrackerVisible={imbuementTrackerVisible}
        vipVisible={vipPanelVisible}
        partyVisible={partyPanelVisible}
        gold={inventory ? countMoneyWorth(inventory) : 0}
        bankBalance={bankBalance}
        mantusCoins={mantusCoins}
        storeOpen={storeOpen}
        activePanel={activePanel}
        onCharacter={panelActions.toggleCharacterStats}
        onInventory={panelActions.toggleInventory}
        onVip={panelActions.toggleVipPanel}
        onParty={panelActions.togglePartyPanel}
        onGuild={panelActions.toggleGuildModal}
        onHouse={panelActions.toggleHouseModal}
        onHighscores={panelActions.toggleHighscores}
        onWiki={panelActions.toggleWiki}
        onWheel={panelActions.toggleWheel}
        onForge={panelActions.toggleForge}
        onProficiency={panelActions.toggleProficiency}
        onTracker={panelActions.toggleTracker}
        onImbuementTracker={panelActions.toggleImbuementTracker}
        onPrey={panelActions.togglePrey}
        onQuests={panelActions.toggleQuestLog}
        onHuntingTasks={panelActions.toggleHuntingTasks}
        onHuntFinder={panelActions.toggleHuntFinder}
        onOutfits={panelActions.toggleOutfits}
        onProfile={panelActions.toggleProfile}
        onBattleList={panelActions.toggleBattleList}
        onMinimap={panelActions.toggleMinimap}
        onStore={panelActions.toggleStore}
        onFightModeChange={(mode) =>
          runtime.clientRef.current?.setFightMode(mode)
        }
        onMarket={panelActions.toggleMarket}
        onSettings={() => {
          const state = store.getState();
          state.setInventoryOpen(false);
          state.setCharacterStatsOpen(false);
          state.setGameMenuOpen(true);
        }}
      />
    </div>
  );
}
