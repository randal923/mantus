export interface ProficiencyPerk {
  readonly type: string;
  readonly value: number;
  readonly skill?: string;
  readonly spellId?: number;
  readonly augmentType?: number;
  readonly element?: string;
  readonly range?: number;
  readonly bestiaryId?: number;
  readonly bestiaryName?: string;
}

export interface ProficiencyLevel {
  readonly perks: ReadonlyArray<ProficiencyPerk>;
}

/**
 * One weapon perk table from the static proficiencies.json asset. The asset
 * is pinned server content mirrored for display; earned progress and legal
 * selections always come from `proficiency-state`.
 */
export interface ProficiencyProfile {
  readonly proficiencyId: number;
  readonly name: string;
  readonly version: number;
  readonly levels: ReadonlyArray<ProficiencyLevel>;
}
