import { useEffect } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { LevelUpBanner } from "../LevelUpBanner";
import { Toast } from "../ui/Toast";
import { useGameWindowStore } from "./store/useGameWindowStore";

const SCREEN_MESSAGE_MS = 3_500;
const LEVEL_UP_NOTICE_MS = 4_200;

export function GameNotifications() {
  const { t } = useAppTranslation();
  const status = useGameWindowStore((state) => state.status);
  const characterId = useGameWindowStore(
    (state) => state.ownCharacter?.id ?? null,
  );
  const serverError = useGameWindowStore((state) => state.serverError);
  const marketToast = useGameWindowStore((state) => state.marketToast);
  const tradeToast = useGameWindowStore((state) => state.tradeToast);
  const houseToast = useGameWindowStore((state) => state.houseToast);
  const guildToast = useGameWindowStore((state) => state.guildToast);
  const vipToast = useGameWindowStore((state) => state.vipToast);
  const levelUpNotice = useGameWindowStore((state) => state.levelUpNotice);
  const setLevelUpNotice = useGameWindowStore(
    (state) => state.setLevelUpNotice,
  );
  const runeTargeting = useGameWindowStore((state) => state.runeTargeting);
  const potionTargeting = useGameWindowStore(
    (state) => state.potionTargeting,
  );
  const useWithTargeting = useGameWindowStore(
    (state) => state.useWithTargeting,
  );
  const screenMessage = useGameWindowStore((state) => state.screenMessage);
  const clearScreenMessage = useGameWindowStore(
    (state) => state.clearScreenMessage,
  );

  useEffect(() => {
    if (!screenMessage) return;
    const timer = setTimeout(clearScreenMessage, SCREEN_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [screenMessage, clearScreenMessage]);

  useEffect(() => {
    if (!levelUpNotice) return;
    const timer = setTimeout(
      () => setLevelUpNotice(null),
      LEVEL_UP_NOTICE_MS,
    );
    return () => clearTimeout(timer);
  }, [levelUpNotice, setLevelUpNotice]);
  const reconnect = useGameWindowStore((state) => state.reconnect);
  const setServerError = useGameWindowStore((state) => state.setServerError);
  const setMarketToast = useGameWindowStore((state) => state.setMarketToast);
  const setTradeToast = useGameWindowStore((state) => state.setTradeToast);
  const setHouseToast = useGameWindowStore((state) => state.setHouseToast);
  const setGuildToast = useGameWindowStore((state) => state.setGuildToast);
  const setVipToast = useGameWindowStore((state) => state.setVipToast);
  const showServerErrorAsToast =
    serverError === "combat-action-failed" ||
    serverError?.startsWith("spell-") === true;

  return (
    <>
      {status === "disconnected" && characterId && (
        <button
          type="button"
          role="alert"
          onClick={() => reconnect(characterId)}
          className="ui-panel-frame absolute top-24 left-1/2 z-50 -translate-x-1/2 px-4 py-3 font-tibia text-sm text-ui-text-bright"
        >
          {t("connection.disconnected")} · {t("connection.reconnect")}
        </button>
      )}
      {serverError && showServerErrorAsToast && (
        <Toast
          message={t(`serverErrors.${serverError}`)}
          onDismiss={() => setServerError(null)}
          autoDismissMs={3000}
        />
      )}
      {serverError && !showServerErrorAsToast && (
        <button
          type="button"
          role="alert"
          onClick={() => setServerError(null)}
          className="ui-panel-frame absolute top-24 left-1/2 z-50 max-w-md -translate-x-1/2 px-4 py-3 font-tibia text-sm text-red-200"
        >
          {t(`serverErrors.${serverError}`, {
            defaultValue: t("serverErrors.unknown"),
          })}
        </button>
      )}
      {marketToast && (
        <Toast
          message={t(`auction.toast.${marketToast}`)}
          onDismiss={() => setMarketToast(null)}
        />
      )}
      {tradeToast && (
        <Toast
          message={t(`trade.closed.${tradeToast}`)}
          onDismiss={() => setTradeToast(null)}
        />
      )}
      {houseToast && (
        <Toast
          message={t(`house.events.${houseToast.kind}`, {
            house: houseToast.houseName,
            detail: houseToast.detail,
            warningsLeft: houseToast.warningsLeft ?? 0,
          })}
          onDismiss={() => setHouseToast(null)}
        />
      )}
      {guildToast && (
        <Toast
          message={t(`guild.events.${guildToast.kind}`, {
            detail: guildToast.detail,
            defaultValue: t("guild.events.member-joined", {
              detail: guildToast.detail,
            }),
          })}
          onDismiss={() => setGuildToast(null)}
        />
      )}
      {vipToast && (
        <Toast
          message={t("vip.loggedIn", { name: vipToast })}
          onDismiss={() => setVipToast(null)}
        />
      )}
      {levelUpNotice && (
        <LevelUpBanner
          key={`level-up-${levelUpNotice.id}`}
          level={levelUpNotice.level}
        />
      )}
      {runeTargeting && (
        <div
          role="status"
          className="ui-panel-frame pointer-events-none absolute top-24 left-1/2 z-40 -translate-x-1/2 px-4 py-2 font-tibia text-sm text-ui-text-bright"
        >
          {t("combat.selectRuneTarget")}
        </div>
      )}
      {potionTargeting && (
        <div
          role="status"
          className="ui-panel-frame pointer-events-none absolute top-24 left-1/2 z-40 -translate-x-1/2 px-4 py-2 font-tibia text-sm text-ui-text-bright"
        >
          {t("potions.selectTarget")}
        </div>
      )}
      {useWithTargeting && (
        <div
          role="status"
          className="ui-panel-frame pointer-events-none absolute top-24 left-1/2 z-40 -translate-x-1/2 px-4 py-2 font-tibia text-sm text-ui-text-bright"
        >
          {t("inventory.selectUseWithTarget")}
        </div>
      )}
      {screenMessage && (
        <div
          key={`screen-message-${screenMessage.id}`}
          role="status"
          className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
        >
          <span
            className={`max-w-lg px-4 text-center font-tibia text-base font-bold sm:text-lg [text-shadow:-1px_-1px_0_#000,1px_-1px_0_#000,-1px_1px_0_#000,1px_1px_0_#000,0_2px_4px_rgba(0,0,0,0.9)] ${
              screenMessage.tone === "look" ? "text-yellow-300" : "text-white"
            }`}
          >
            {screenMessage.text}
          </span>
        </div>
      )}
    </>
  );
}
