import type { CharacterMenuEntryId } from "./CharacterMenuEntry";

/** Line art per menu row, in the same 24×24 stroked style as the nav bar. */
const PATHS: Record<CharacterMenuEntryId, string> = {
  tracker:
    "M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4",
  imbuementTracker:
    "M12 6.5v5.5l3.5 2",
  battleList: "M9.5 6.5H20M9.5 12H20M9.5 17.5H20",
  profile: "m9.5 12.8-2 7.2 4.5-2.5 4.5 2.5-2-7.2M12 7v2.5l1.5 1",
  outfit: "M9 4.5 5 7l1.5 3.5L8 9.5V20h8V9.5l1.5 1L19 7l-4-2.5a3 3 0 0 1-6 0z",
  proficiency: "m5 19 8.5-8.5M13 4.5 19.5 4l-.5 6.5L9.5 20 4 14.5zM16 8.5 18.5 6",
  guild: "M6 3.5v17M6 4.5h11.5l-2.5 3.5 2.5 3.5H6M4 20.5h4",
  quests:
    "M6 4.5h10.5A1.5 1.5 0 0 1 18 6v14H7.5A1.5 1.5 0 0 1 6 18.5zM6 18.5A1.5 1.5 0 0 1 7.5 17H18M9 8h6M9 11h4",
  party: "M2.5 20a5.5 5.5 0 0 1 11 0M13 19.5a4.5 4.5 0 0 1 8.5 0",
  vip: "M3.5 20a5.5 5.5 0 0 1 11 0m3.5-15 .9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z",
};

/** Circles the paths above cannot express on their own. */
const CIRCLES: Partial<
  Record<CharacterMenuEntryId, ReadonlyArray<[number, number, number]>>
> = {
  tracker: [
    [12, 12, 6.5],
    [12, 12, 1.5],
  ],
  imbuementTracker: [[12, 12, 8.5]],
  battleList: [
    [5.5, 6.5, 1.5],
    [5.5, 12, 1.5],
    [5.5, 17.5, 1.5],
  ],
  profile: [[12, 9, 4.5]],
  party: [
    [8, 8, 3],
    [17, 9, 2.5],
  ],
  vip: [[9, 8, 3.5]],
};

export function CharacterMenuIcon({ id }: { readonly id: CharacterMenuEntryId }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {(CIRCLES[id] ?? []).map(([cx, cy, r]) => (
        <circle key={`${cx}:${cy}:${r}`} cx={cx} cy={cy} r={r} />
      ))}
      <path d={PATHS[id]} />
    </svg>
  );
}
