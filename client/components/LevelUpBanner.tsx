import { useAppTranslation } from "../i18n/useAppTranslation";
import styles from "./LevelUpBanner.module.css";

interface LevelUpBannerProps {
  level: number;
}

export function LevelUpBanner({ level }: LevelUpBannerProps) {
  const { t } = useAppTranslation();

  return (
    <div
      role="status"
      aria-atomic="true"
      aria-live="polite"
      className="pointer-events-none absolute top-24 left-1/2 z-30 w-full max-w-sm -translate-x-1/2 px-4"
    >
      <div className={styles.banner}>
        <div className={styles.content}>
          <div aria-hidden className={styles.sigil}>
            {level}
          </div>
          <div className="min-w-0 text-left">
            <p className="font-display text-xl font-medium tracking-wide text-ui-text-bright">
              {t("hud.levelUpTitle", { level })}
            </p>
            <p className="mt-1 text-sm text-ui-text">
              {t("hud.levelUpDescription")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
