import type { GoldConverterSweep } from "../item/plan/planGoldConverterSweep";

const coins = (count: number, name: string) =>
  `${count} ${name} coin${count === 1 ? "" : "s"}`;

/** The status line a gold converter use answers with (≤ 160 chars). */
export function describeGoldConverterSweep(sweep: GoldConverterSweep): string {
  const parts: string[] = [];
  if (sweep.platinumMinted > 0) {
    parts.push(
      `${coins(sweep.goldSpent, "gold")} into ${coins(sweep.platinumMinted, "platinum")}`,
    );
  }
  if (sweep.crystalMinted > 0) {
    parts.push(
      `${coins(sweep.platinumSpent, "platinum")} into ${coins(sweep.crystalMinted, "crystal")}`,
    );
  }
  const summary = `Converted ${parts.join(" and ")}.`;
  return sweep.converterDestroyed
    ? `${summary} The gold converter is used up.`
    : summary;
}
