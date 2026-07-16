import type {
  CharacterVocation,
  Skill,
  StarterVocation,
} from "@tibia/protocol";

export interface Vocation {
  readonly id: CharacterVocation;
  readonly numericId: number;
  readonly baseVocation: StarterVocation;
  readonly promotedFrom: StarterVocation | null;
  readonly promotedVocation: CharacterVocation | null;
  readonly starter: boolean;
  readonly gains: {
    readonly health: number;
    readonly mana: number;
    readonly capacity: number;
  };
  readonly regeneration: {
    readonly healthIntervalMs: number;
    readonly healthAmount: number;
    readonly manaIntervalMs: number;
    readonly manaAmount: number;
    readonly soulIntervalMs: number;
    readonly soulAmount: number;
  };
  readonly maxSoul: number;
  readonly attackSpeedMs: number;
  readonly baseSpeed: number;
  readonly magicProgressionMultiplier: number;
  readonly skillProgressionMultipliers: Readonly<Record<Skill, number>>;
  readonly formulas: {
    readonly meleeDamage: number;
    readonly distanceDamage: number;
    readonly defense: number;
    readonly armor: number;
    readonly mitigation: number;
    readonly primaryShield: number;
    readonly secondaryShield: number;
  };
  readonly client: {
    readonly name: string;
    readonly description: string;
    readonly avatarLookType: number;
  };
}
