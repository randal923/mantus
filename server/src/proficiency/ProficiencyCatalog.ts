export type ProficiencyPerkType =
  | "attack-damage"
  | "defense-bonus"
  | "weapon-shield-modifier"
  | "skill-bonus"
  | "specialized-magic-level"
  | "spell-augment"
  | "bestiary-damage"
  | "powerful-foe-bonus"
  | "critical-hit-chance"
  | "elemental-hit-chance"
  | "rune-critical-hit-chance"
  | "auto-attack-critical-hit-chance"
  | "critical-extra-damage"
  | "elemental-critical-extra-damage"
  | "rune-critical-extra-damage"
  | "auto-attack-critical-extra-damage"
  | "mana-leech"
  | "life-leech"
  | "mana-gain-on-hit"
  | "life-gain-on-hit"
  | "mana-gain-on-kill"
  | "life-gain-on-kill"
  | "perfect-shot-damage"
  | "ranged-hit-chance"
  | "attack-range"
  | "skill-percentage-auto-attack"
  | "skill-percentage-spell-damage"
  | "skill-percentage-spell-healing"
  | "alpha-strike-extra-damage"
  | "omega-strike-extra-damage"
  | "armor-penetration"
  | "elemental-pierce";

export interface ProficiencyPerk {
  readonly type: ProficiencyPerkType;
  readonly value: number;
  readonly skill?: string;
  readonly spellId?: number;
  readonly augmentType?: number;
  readonly element?: number;
  readonly range?: number;
  readonly bestiaryId?: number;
  readonly bestiaryName?: string;
}

export interface ProficiencyProfile {
  readonly proficiencyId: number;
  readonly name: string;
  readonly levels: ReadonlyArray<{
    readonly perks: ReadonlyArray<ProficiencyPerk>;
  }>;
}

export interface ProficiencyCatalog {
  readonly profiles: ReadonlyMap<number, ProficiencyProfile>;
}
