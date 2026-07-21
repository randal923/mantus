import { useAppTranslation } from "../../i18n/useAppTranslation";
import { HighscoresModal } from "../social/HighscoresModal";
import { WheelModal } from "../wheel/WheelModal";
import { WikiModal } from "../wiki/WikiModal";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GameProgressionOverlays() {
  const { t } = useAppTranslation();
  const store = useGameWindowStoreApi();
  const runtime = store.getState().runtime;
  const vocation = useGameWindowStore(
    (state) => state.ownCharacter?.vocation ?? null,
  );
  const highscoresOpen = useGameWindowStore((state) => state.highscoresOpen);
  const wikiOpen = useGameWindowStore((state) => state.wikiOpen);
  const wheelOpen = useGameWindowStore((state) => state.wheelOpen);
  const highscoresSession = useGameWindowStore(
    (state) => state.sessions?.highscores ?? null,
  );
  const bestiarySession = useGameWindowStore(
    (state) => state.sessions?.bestiary ?? null,
  );
  const bosstiarySession = useGameWindowStore(
    (state) => state.sessions?.bosstiary ?? null,
  );
  const wheelSession = useGameWindowStore(
    (state) => state.sessions?.wheel ?? null,
  );
  const gemSession = useGameWindowStore(
    (state) => state.sessions?.gems ?? null,
  );
  const sessionActions = useGameWindowStore((state) => state.sessionActions);
  const setHighscoresOpen = useGameWindowStore(
    (state) => state.setHighscoresOpen,
  );
  const setWikiOpen = useGameWindowStore((state) => state.setWikiOpen);
  const setWheelOpen = useGameWindowStore((state) => state.setWheelOpen);
  if (
    !vocation ||
    !highscoresSession ||
    !bestiarySession ||
    !bosstiarySession ||
    !wheelSession ||
    !gemSession ||
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
          bestiaryPending={bestiarySession.pending}
          bosstiaryPending={bosstiarySession.pending}
          itemSourcesPending={bestiarySession.sourcesPending}
          bestiaryError={bestiarySession.error}
          bosstiaryError={bosstiarySession.error}
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
    </>
  );
}
