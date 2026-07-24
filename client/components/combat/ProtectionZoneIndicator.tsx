import Image from "next/image";
import { useAppTranslation } from "../../i18n/useAppTranslation";

interface ProtectionZoneIndicatorProps {
  active: boolean;
}

export function ProtectionZoneIndicator({
  active,
}: ProtectionZoneIndicatorProps) {
  const { t } = useAppTranslation();

  if (!active) return null;

  const label = t("combat.protectionZone");

  return (
    <div
      aria-label={label}
      title={label}
      className="ui-panel-frame pointer-events-auto flex items-center gap-2 p-1.5"
    >
      <span className="relative flex size-8 items-center justify-center rounded border border-ui-gold/20 bg-black/35">
        <Image
          src="/images/game/states/protection_zone.png"
          alt=""
          width={18}
          height={18}
          unoptimized
        />
      </span>
      <span className="pr-1 text-sm font-medium text-ui-text-bright">
        {label}
      </span>
    </div>
  );
}
