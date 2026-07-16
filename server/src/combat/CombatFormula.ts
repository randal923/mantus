export class CombatFormula {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  chance(percent: number): boolean {
    if (percent <= 0) return false;
    if (percent >= 100) return true;
    return this.random() * 100 < percent;
  }

  integer(minimum: number, maximum: number): number {
    const lower = Math.ceil(Math.min(minimum, maximum));
    const upper = Math.floor(Math.max(minimum, maximum));
    if (upper <= lower) return lower;
    return lower + Math.floor(this.random() * (upper - lower + 1));
  }

  playerDamage(options: {
    level: number;
    skill: number;
    attack: number;
    vocationMultiplier: number;
    fightMultiplier: number;
  }): { minimum: number; maximum: number } {
    const maximum = Math.max(
      1,
      Math.floor(
        ((options.skill * options.attack) / 20 + options.level / 5) *
          options.vocationMultiplier *
          options.fightMultiplier,
      ),
    );
    return {
      minimum: Math.max(0, Math.floor(maximum * 0.35)),
      maximum,
    };
  }

  spellDamage(options: {
    level: number;
    magicLevel: number;
    minimumBase: number;
    maximumBase: number;
    levelFactor: number;
    magicFactor: number;
  }): { minimum: number; maximum: number } {
    return {
      minimum: Math.max(
        0,
        Math.floor(
          options.minimumBase +
            options.level * options.levelFactor +
            options.magicLevel * options.magicFactor,
        ),
      ),
      maximum: Math.max(
        0,
        Math.floor(
          options.maximumBase +
            options.level * options.levelFactor +
            options.magicLevel * options.magicFactor,
        ),
      ),
    };
  }

  private random(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0 || 0x9e3779b9;
    return this.state / 0x1_0000_0000;
  }
}
