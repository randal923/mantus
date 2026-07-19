import { useAppTranslation } from "../../i18n/useAppTranslation";

type MantusLogoSize = "sm" | "lg";

interface MantusLogoProps {
  size?: MantusLogoSize;
  className?: string;
}

const NAME_CLASS: Record<MantusLogoSize, string> = {
  sm: "text-xl",
  lg: "text-5xl sm:text-6xl",
};

const SUBTITLE_CLASS: Record<MantusLogoSize, string> = {
  sm: "text-[0.5rem]",
  lg: "mt-1 text-xs",
};

export function MantusLogo({ size = "lg", className }: MantusLogoProps) {
  const { t } = useAppTranslation();

  return (
    <span
      role="img"
      aria-label={t("brand.name")}
      className={`relative isolate inline-flex flex-col items-center ${className ?? ""}`}
    >
      <span
        aria-hidden
        className={`block bg-linear-to-b from-ui-text-bright via-ui-text to-ui-gold bg-clip-text font-display font-black leading-none tracking-wider text-transparent uppercase ${NAME_CLASS[size]}`}
      >
        {t("brand.mantus")}
      </span>
      <span
        aria-hidden
        className={`pl-[0.48em] font-display font-bold tracking-[0.48em] text-ui-accent-light uppercase ${SUBTITLE_CLASS[size]}`}
      >
        {t("brand.online")}
      </span>
    </span>
  );
}
