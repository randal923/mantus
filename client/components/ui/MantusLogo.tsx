interface MantusLogoProps {
  className?: string;
}

export function MantusLogo({ className }: MantusLogoProps) {
  const { t } = useAppTranslation();

  return (
    <span
      role="img"
      aria-label={t("brand.name")}
      className={`relative isolate inline-flex flex-col items-center ${className ?? ""}`}
    >
      <span
        aria-hidden
        className="block bg-linear-to-b from-ui-text-bright via-ui-text to-ui-gold bg-clip-text font-display text-5xl font-black leading-none tracking-wider text-transparent uppercase sm:text-6xl"
      >
        {t("brand.mantus")}
      </span>
      <span
        aria-hidden
        className="mt-1 pl-[0.48em] font-display text-xs font-bold tracking-[0.48em] text-ui-accent-light uppercase"
      >
        {t("brand.online")}
      </span>
    </span>
  );
}
import { useAppTranslation } from "../../i18n/useAppTranslation";
