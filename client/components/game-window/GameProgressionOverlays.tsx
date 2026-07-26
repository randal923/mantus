import { useAppTranslation } from "../../i18n/useAppTranslation";
import { OutfitModal } from "../outfit/OutfitModal";
import { PodiumModal } from "../podium/PodiumModal";
import { HighscoresModal } from "../social/HighscoresModal";
import { WheelModal } from "../wheel/WheelModal";
import { WikiModal } from "../wiki/WikiModal";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GameProgressionOverlays() {
  const { t } = useAppTranslation();
  const store = useGameWindowStoreApi();
  const runtime = store.getState().runtime;
  const ownCharacter = useGameWindowStore((state) => state.ownCharacter);
  const vocation = ownCharacter?.vocation ?? null;
  const ownOutfit = ownCharacter?.outfit ?? null;
  const highscoresOpen = useGameWindowStore((state) => state.highscoresOpen);
  const wikiOpen = useGameWindowStore((state) => state.wikiOpen);
  const wheelOpen = useGameWindowStore((state) => state.wheelOpen);
  const outfitWindowOpen = useGameWindowStore(
    (state) => state.outfitWindowOpen,
  );
  const podiumWindow = useGameWindowStore((state) => state.podiumWindow);
  const podiumError = useGameWindowStore((state) => state.podiumError);
  const setPodiumWindow = useGameWindowStore(
    (state) => state.setPodiumWindow,
  );
  const highscoresSession = useGameWindowStore(
    (state) => state.sessions?.highscores ?? null,
  );
  const bestiarySession = useGameWindowStore(
    (state) => state.sessions?.bestiary ?? null,
  );
  const bosstiarySession = useGameWindowStore(
    (state) => state.sessions?.bosstiary ?? null,
  );
  const boostedSession = useGameWindowStore(
    (state) => state.sessions?.boosted ?? null,
  );
  const animusSession = useGameWindowStore(
    (state) => state.sessions?.animus ?? null,
  );
  const cyclopediaSession = useGameWindowStore(
    (state) => state.sessions?.cyclopedia ?? null,
  );
  const profileSession = useGameWindowStore(
    (state) => state.sessions?.profile ?? null,
  );
  const capacityUsed = useGameWindowStore(
    (state) => state.sessions?.inventory?.capacityUsed ?? null,
  );
  const trackerSession = useGameWindowStore(
    (state) => state.sessions?.tracker ?? null,
  );
  const bossSlotsSession = useGameWindowStore(
    (state) => state.sessions?.bossSlots ?? null,
  );
  const wheelSession = useGameWindowStore(
    (state) => state.sessions?.wheel ?? null,
  );
  const gemSession = useGameWindowStore(
    (state) => state.sessions?.gems ?? null,
  );
  const outfitSession = useGameWindowStore(
    (state) => state.sessions?.outfit ?? null,
  );
  const sessionActions = useGameWindowStore((state) => state.sessionActions);
  const setHighscoresOpen = useGameWindowStore(
    (state) => state.setHighscoresOpen,
  );
  const setWikiOpen = useGameWindowStore((state) => state.setWikiOpen);
  const setWheelOpen = useGameWindowStore((state) => state.setWheelOpen);
  const setOutfitWindowOpen = useGameWindowStore(
    (state) => state.setOutfitWindowOpen,
  );
  if (
    !ownCharacter ||
    !vocation ||
    !highscoresSession ||
    !bestiarySession ||
    !bosstiarySession ||
    !boostedSession ||
    !animusSession ||
    !cyclopediaSession ||
    !profileSession ||
    !trackerSession ||
    !bossSlotsSession ||
    !wheelSession ||
    !gemSession ||
    !outfitSession ||
    !sessionActions
  ) {
    return null;
  }

  return (
    <>
      {highscoresOpen && (
        <HighscoresModal
          page={highscoresSession.page}
          pending={highscoresSession.pending}
          error={
            highscoresSession.error
              ? t(`highscores.errors.${highscoresSession.error}`, {
                  defaultValue: t("highscores.errors.unavailable"),
                })
              : null
          }
          onRequest={(category, requestedVocation, requestedPage) => {
            const sent =
              runtime.clientRef.current?.requestHighscores(
                category,
                requestedVocation,
                requestedPage,
              ) ?? false;
            sessionActions.highscores.begin(sent);
          }}
          onClose={() => setHighscoresOpen(false)}
        />
      )}
      {wikiOpen && (
        <WikiModal
          creatures={bestiarySession.creatures}
          monster={bestiarySession.monster}
          bosses={bosstiarySession.bosses}
          boss={bosstiarySession.boss}
          itemSources={bestiarySession.itemSources}
          boosted={boostedSession.state}
          animus={animusSession.state}
          trackedBestiaryRaceIds={(trackerSession.bestiary ?? []).map(
            (entry) => entry.raceId,
          )}
          trackedBosstiaryRaceIds={(trackerSession.bosstiary ?? []).map(
            (entry) => entry.raceId,
          )}
          bossSlots={bossSlotsSession.state}
          character={ownCharacter}
          capacityUsed={capacityUsed}
          combat={cyclopediaSession.combat}
          deaths={cyclopediaSession.deaths}
          pvpKills={cyclopediaSession.pvpKills}
          itemSummary={cyclopediaSession.itemSummary}
          profile={profileSession.profile}
          bestiaryPending={bestiarySession.pending}
          bosstiaryPending={bosstiarySession.pending}
          itemSourcesPending={bestiarySession.sourcesPending}
          bossSlotsPending={bossSlotsSession.pending}
          cyclopediaPending={cyclopediaSession.pending}
          bestiaryError={bestiarySession.error}
          bosstiaryError={bosstiarySession.error}
          bossSlotsError={
            bossSlotsSession.error
              ? t(`bossSlots.errors.${bossSlotsSession.error}`, {
                  defaultValue: t("bossSlots.errors.invalid-request"),
                })
              : null
          }
          cyclopediaError={
            cyclopediaSession.error
              ? t(`wiki.character.errors.${cyclopediaSession.error}`, {
                  defaultValue: t("wiki.character.errors.invalid-request"),
                })
              : null
          }
          onRequestBossSlots={() => {
            const sent =
              runtime.clientRef.current?.requestBossSlots() ?? false;
            sessionActions.bossSlots.begin(sent);
          }}
          onRequestCyclopedia={(view, page) => {
            const sent =
              runtime.clientRef.current?.requestCyclopediaCharacter(
                view,
                page,
              ) ?? false;
            sessionActions.cyclopedia.begin(sent);
          }}
          onToggleTrack={(scope, raceId, enabled) => {
            runtime.clientRef.current?.setTracker(scope, raceId, enabled);
          }}
          onAssignBossSlot={(slot, raceId) => {
            const sent =
              runtime.clientRef.current?.setBossSlot(slot, raceId) ?? false;
            sessionActions.bossSlots.begin(sent);
          }}
          onClearBossSlot={(slot) => {
            const sent =
              runtime.clientRef.current?.setBossSlot(slot, null) ?? false;
            sessionActions.bossSlots.begin(sent);
          }}
          onRequestBestiary={() => {
            const sent =
              runtime.clientRef.current?.requestBestiaryCreatures() ?? false;
            sessionActions.bestiary.begin(sent);
          }}
          onRequestMonster={(raceId) => {
            const sent =
              runtime.clientRef.current?.requestBestiaryMonster(raceId) ??
              false;
            sessionActions.bestiary.begin(sent);
          }}
          onRequestBosstiary={() => {
            const sent = runtime.clientRef.current?.requestBosstiary() ?? false;
            sessionActions.bosstiary.begin(sent);
          }}
          onRequestBoss={(raceId) => {
            const sent =
              runtime.clientRef.current?.requestBosstiaryBoss(raceId) ?? false;
            sessionActions.bosstiary.begin(sent);
          }}
          onRequestItemSources={(itemTypeId) => {
            const sent =
              runtime.clientRef.current?.requestWikiItemSources(itemTypeId) ??
              false;
            sessionActions.bestiary.beginSources(sent);
          }}
          onClose={() => setWikiOpen(false)}
        />
      )}
      {wheelOpen && (
        <WheelModal
          wheel={wheelSession.wheel}
          gems={gemSession.gems}
          vocation={vocation}
          pending={wheelSession.pending}
          gemsPending={gemSession.pending}
          error={wheelSession.error}
          gemsError={gemSession.error}
          onSave={(slices) => {
            const sent =
              runtime.clientRef.current?.saveWheel(
                crypto.randomUUID(),
                slices,
              ) ??
              false;
            sessionActions.wheel.begin(sent);
          }}
          onRequestGems={() => {
            const sent = runtime.clientRef.current?.requestGems() ?? false;
            sessionActions.gems.begin(sent);
          }}
          onGemAction={(action) => {
            const sent =
              runtime.clientRef.current?.sendGemAction(
                crypto.randomUUID(),
                action,
              ) ?? false;
            sessionActions.gems.begin(sent);
          }}
          onClose={() => setWheelOpen(false)}
        />
      )}
      {outfitWindowOpen && outfitSession.outfit && ownOutfit && (
        <OutfitModal
          outfits={outfitSession.outfit.outfits}
          mounts={outfitSession.outfit.mounts}
          initial={{
            lookType: outfitSession.outfit.selectedLookType,
            head: ownOutfit.head,
            body: ownOutfit.body,
            legs: ownOutfit.legs,
            feet: ownOutfit.feet,
            addons: ownOutfit.addons,
            mountId: outfitSession.outfit.selectedMountId,
          }}
          pending={outfitSession.pending}
          error={
            outfitSession.error
              ? t(`outfit.errors.${outfitSession.error}`, {
                  defaultValue: t("outfit.errors.invalid-request"),
                })
              : null
          }
          onConfirm={(selection) => {
            const sent =
              runtime.clientRef.current?.selectOutfit(selection) ?? false;
            sessionActions.outfit.begin(sent);
          }}
          onClose={() => setOutfitWindowOpen(false)}
        />
      )}
      {podiumWindow && (
        <PodiumModal
          window={podiumWindow}
          error={
            podiumError
              ? t(`podium.errors.${podiumError}`, {
                  defaultValue: t("podium.errors.invalid-request"),
                })
              : null
          }
          onApply={(selection) => {
            runtime.clientRef.current?.setPodium({
              itemId: podiumWindow.itemId,
              revision: podiumWindow.revision,
              position: podiumWindow.position,
              ...selection,
            });
          }}
          onClose={() => setPodiumWindow(null)}
        />
      )}
    </>
  );
}
