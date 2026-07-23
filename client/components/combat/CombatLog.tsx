import { useAppTranslation } from "../../i18n/useAppTranslation";

interface CombatLogProps {
  entries: ReadonlyArray<string>;
}

export function CombatLog({ entries }: CombatLogProps) {
  const { t } = useAppTranslation();
  if (entries.length === 0) return null;

  return (
    <section
      aria-label={t("combat.log")}
      aria-live="polite"
      className="ui-panel-frame pointer-events-auto absolute bottom-24 left-4 w-72 p-2 text-sm text-ui-text"
    >
      {entries.map((entry, index) => (
        <p key={`${index}:${entry}`} className="truncate">
          {entry}
        </p>
      ))}
    </section>
  );
}
