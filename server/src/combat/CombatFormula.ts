import type { FightMode } from "@tibia/protocol";

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

  normalInteger(minimum: number, maximum: number): number {
    const lower = Math.ceil(Math.min(minimum, maximum));
    const upper = Math.floor(Math.max(minimum, maximum));
    if (upper <= lower) return lower;

    let normalized = 0;
    do {
      const first = Math.max(this.random(), Number.EPSILON);
      const second = this.random();
      const standardNormal =
        Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
      normalized = 0.5 + standardNormal * 0.25;
    } while (normalized < 0 || normalized > 1);

    return lower + Math.round(normalized * (upper - lower));
  }

  playerMeleeDamage(options: {
    level: number;
    skill: number;
    attack: number;
    vocationMultiplier: number;
    fightMode: FightMode["attack"];
    fist: boolean;
  }): { minimum: number; maximum: number } {
    const levelDamage = Math.floor(options.level / 5);
    const maximum = Math.max(
      0,
      Math.floor(
        Math.round(
          0.085 *
            this.attackFactor(options.fightMode) *
            Math.max(0, options.attack) *
            options.skill +
            levelDamage,
        ) * options.vocationMultiplier,
      ),
    );
    return {
      minimum: options.fist ? 0 : levelDamage,
      maximum,
    };
  }

  playerDistanceDamage(options: {
    level: number;
    skill: number;
    attack: number;
    vocationMultiplier: number;
    fightMode: FightMode["attack"];
    targetIsPlayer: boolean;
    hasElement: boolean;
  }): { minimum: number; maximum: number } {
    let minimum = Math.floor(options.level / 5);
    let maximum = Math.round(
      0.09 *
        this.attackFactor(options.fightMode) *
        options.skill *
        options.attack +
        minimum,
    );
    if (options.targetIsPlayer) {
      minimum = Math.floor(minimum / (options.hasElement ? 4 : 2));
    } else if (options.hasElement) {
      minimum = Math.floor(minimum / 2);
      maximum = Math.floor(maximum / 2);
    }
    return {
      minimum,
      maximum: Math.max(
        minimum,
        Math.floor(maximum * options.vocationMultiplier),
      ),
    };
  }

  distanceHitChance(options: {
    skill: number;
    distance: number;
    hitChance?: number;
    maxHitChance?: number;
  }): number {
    if (options.hitChance !== undefined && options.hitChance !== 0) {
      return this.percent(options.hitChance);
    }
    const maximum = options.maxHitChance ?? 75;
    const skill = Math.max(0, options.skill);
    const distance = Math.max(1, Math.floor(options.distance));
    if (maximum === 75) {
      if (distance === 1 || distance === 5) return Math.min(skill, 74) + 1;
      if (distance === 2) return Math.floor(Math.min(skill, 28) * 2.4) + 8;
      if (distance === 3) return Math.floor(Math.min(skill, 45) * 1.55) + 6;
      if (distance === 4) return Math.floor(Math.min(skill, 58) * 1.25) + 3;
      if (distance === 6) return Math.floor(Math.min(skill, 90) * 0.8) + 3;
      if (distance === 7) return Math.floor(Math.min(skill, 104) * 0.7) + 2;
      return this.percent(options.hitChance ?? 0);
    }
    if (maximum === 90) {
      if (distance === 1 || distance === 5) {
        return Math.floor(Math.min(skill, 74) * 1.2) + 1;
      }
      if (distance === 2) return Math.floor(Math.min(skill, 28) * 3.2);
      if (distance === 3) return Math.min(skill, 45) * 2;
      if (distance === 4) return Math.floor(Math.min(skill, 58) * 1.55);
      if (distance === 6 || distance === 7) return Math.min(skill, 90);
      return this.percent(options.hitChance ?? 0);
    }
    if (maximum === 100) {
      if (distance === 1 || distance === 5) {
        return Math.floor(Math.min(skill, 73) * 1.35) + 1;
      }
      if (distance === 2) return Math.floor(Math.min(skill, 30) * 3.2) + 4;
      if (distance === 3) return Math.floor(Math.min(skill, 48) * 2.05) + 2;
      if (distance === 4) return Math.floor(Math.min(skill, 65) * 1.5) + 2;
      if (distance === 6) return Math.floor(Math.min(skill, 87) * 1.2) - 4;
      if (distance === 7) return Math.floor(Math.min(skill, 90) * 1.1) + 1;
      return this.percent(options.hitChance ?? 0);
    }
    return this.percent(maximum);
  }

  defenseReduction(defense: number): number {
    const maximum = Math.max(0, Math.floor(defense));
    return maximum > 0
      ? this.integer(Math.floor(maximum / 2), maximum)
      : 0;
  }

  armorReduction(armor: number): number {
    const maximum = Math.max(0, Math.floor(armor));
    if (maximum <= 0) return 0;
    if (maximum <= 3) return 1;
    return this.integer(
      Math.floor(maximum / 2),
      maximum - ((maximum % 2) + 1),
    );
  }

  applyAbsorbPercent(amount: number, percent: number): number {
    const adjustment = amount * percent / 100;
    const rounded =
      adjustment < 0
        ? -Math.round(Math.abs(adjustment))
        : Math.round(adjustment);
    return Math.max(0, amount - rounded);
  }

  private random(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0 || 0x9e3779b9;
    return this.state / 0x1_0000_0000;
  }

  private attackFactor(mode: FightMode["attack"]): number {
    if (mode === "balanced") return 0.75;
    if (mode === "defensive") return 0.5;
    return 1;
  }

  private percent(value: number): number {
    return Math.max(0, Math.min(100, Math.floor(value)));
  }
}
