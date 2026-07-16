import type { CreatureState } from "@tibia/protocol";

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
  const visible = creatures
    .filter((creature) => creature.id !== ownPlayerId)
    .sort((left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id),
    );
  if (visible.length === 0) return null;
  return (
    <section
      aria-label={title}
      className="ui-panel-frame pointer-events-none absolute top-24 left-4 w-56 p-3"
    >
      <h2 className="mb-2 text-sm font-medium tracking-wide text-ui-text-bright uppercase">
        {title}
      </h2>
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
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-ui-text">{creature.name}</span>
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
