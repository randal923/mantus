import {
  GEM_BASIC_MODS,
  GEM_GRADE_MULTIPLIERS,
  GEM_STAT_RATES,
  GEM_SUPREME_MODS,
  type WheelBaseVocation,
} from "@tibia/protocol";

const formatValue = (value: number): string =>
  Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/\.?0+$/, "");

/** Templates use Lua-style %% escapes; collapse them after substitution. */
const finishLine = (line: string): string => line.replace(/%%/g, "%");

/**
 * Resolves a mod's otclient tooltip template ("+%s%% Fire Resistance\n...")
 * into display lines at the given grade. Each template line consumes the
 * matching effect value in order; literal lines pass through unchanged.
 */
export function gemModLines(
  kind: "basic" | "supreme",
  modId: number,
  grade: number,
  vocation: WheelBaseVocation,
): string[] {
  const multiplier = GEM_GRADE_MULTIPLIERS[grade] ?? 1;
  if (kind === "basic") {
    const mod = GEM_BASIC_MODS.find((candidate) => candidate.id === modId);
    if (!mod) return [];
    const rates = GEM_STAT_RATES[vocation];
    let index = 0;
    return mod.tooltip.split("\n").map((line) => {
      if (!line.includes("%s")) return finishLine(line);
      const effect = mod.effects[index++];
      if (!effect) return finishLine(line);
      const value =
        effect.kind === "stat"
          ? Math.round(((effect.step * rates[effect.stat]) / 100) * multiplier)
          : effect.kind === "mitigation"
            ? effect.percent * multiplier
            : effect.percent *
              (effect.scalesWithGrade ? multiplier : 1);
      return finishLine(line.replace("%s", formatValue(value)));
    });
  }
  const mod = GEM_SUPREME_MODS.find((candidate) => candidate.id === modId);
  if (!mod) return [];
  const effect = mod.effect;
  return mod.tooltip.split("\n").map((line) => {
    if (!line.includes("%s")) return finishLine(line);
    if (effect.kind === "spell") {
      const value = effect.momentum
        ? grade < 3
          ? Math.round(33 * grade) / 100
          : 1
        : (effect.baseI ?? 0) * multiplier;
      return finishLine(line.replace("%s", formatValue(value)));
    }
    const value =
      effect.kind === "revelation"
        ? Math.round(effect.points * multiplier)
        : effect.percent * multiplier;
    return finishLine(line.replace("%s", formatValue(value)));
  });
}
