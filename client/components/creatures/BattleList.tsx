import type { CreatureState } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";

const MAX_RENDERED_CREATURES = 24;

interface BattleListProps {
  title: string;
  creatures: ReadonlyArray<CreatureState>;
  ownPlayerId: string;
  attackTargetId: string | null;
}

export function BattleList({
  title,
  creatures,
  ownPlayerId,
  attackTargetId,
}: BattleListProps) {
  const { t } = useAppTranslation();
  const visible = creatures
    .filter((creature) => creature.id !== ownPlayerId)
    .slice(0, MAX_RENDERED_CREATURES)
    .sort((left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id),
    );
  return (
    <section
      aria-label={title}
      className="ui-panel-frame pointer-events-none absolute top-24 right-4 w-56 p-3"
    >
      <h2 className="mb-2 text-sm font-medium tracking-wide text-ui-text-bright uppercase">
        {title}
      </h2>
      {visible.length === 0 && (
        <p className="text-xs text-ui-muted">{t("hud.battleListEmpty")}</p>
      )}
      <ul className="max-h-64 space-y-2 overflow-hidden">
        {visible.map((creature) => (
          <li
            key={creature.id}
            className={
              creature.id === attackTargetId
                ? "min-w-0 bg-red-950/70 px-1 outline outline-1 outline-red-500"
                : "min-w-0 px-1"
            }
          >
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                {creature.forgeState && (
                  <span
                    title={
                      creature.forgeState.kind === "influenced"
                        ? t("hud.forgeState.influenced", {
                            stack: creature.forgeState.stack,
                          })
                        : t("hud.forgeState.fiendish")
                    }
                    className={`shrink-0 rounded-sm border px-1 text-xs leading-4 font-semibold ${
                      creature.forgeState.kind === "influenced"
                        ? "border-fuchsia-400/60 bg-fuchsia-500/20 text-fuchsia-300"
                        : "border-amber-400/60 bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    {creature.forgeState.kind === "influenced"
                      ? creature.forgeState.stack
                      : "★"}
                  </span>
                )}
                <span className="truncate text-ui-text">{creature.name}</span>
              </span>
              <span className="text-ui-muted">
                {creature.healthPercent === null
                  ? "?"
                  : `${creature.healthPercent}%`}
              </span>
            </div>
            <progress
              aria-label={`${creature.name} health`}
              className="h-1 w-full accent-red-600"
              max={100}
              value={creature.healthPercent ?? 0}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
