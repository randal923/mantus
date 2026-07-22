import type {
  ActionBar,
  CharacterLookType,
  CharacterVocation,
  Direction,
  StarterVocation,
  PotionActionBar,
} from "@tibia/protocol";
import type { CharacterSkill } from "../progression/CharacterSkill";
import type { ProgressionEvent } from "../progression/ProgressionEvent";
import type { SkullState } from "../pvp/SkullState";

export interface CharacterOutfit {
  readonly lookType: CharacterLookType;
  readonly head: number;
  readonly body: number;
  readonly legs: number;
  readonly feet: number;
  readonly addons: number;
}

export interface Character {
  readonly id: string;
  readonly accountId: string;
  readonly displayName: string;
  readonly normalizedName: string;
  readonly vocation: CharacterVocation;
  readonly level: number;
  readonly experience: bigint;
  readonly magicLevel: number;
  readonly manaSpent: bigint;
  readonly health: number;
  readonly mana: number;
  readonly soul: number;
  readonly skills: ReadonlyArray<CharacterSkill>;
  readonly progressionDefinitionVersion: number;
  readonly progressionEventIds: ReadonlyArray<string>;
  readonly storageValues: Readonly<Record<string, number>>;
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  readonly direction: Direction;
  readonly outfit: CharacterOutfit;
  readonly townId: number;
  readonly actionBar: ActionBar;
  readonly potionActionBar: PotionActionBar;
  readonly skull: SkullState;
  readonly skullExpiresAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastLoginAt: Date | null;
  readonly version: number;
}

export interface CharacterSummary {
  readonly id: string;
  readonly displayName: string;
  readonly vocation: CharacterVocation;
  readonly level: number;
  readonly outfit: CharacterOutfit;
  readonly lastLoginAt: Date | null;
}

export interface CreateCharacterInput {
  readonly displayName: string;
  readonly vocation: StarterVocation;
  readonly lookType: CharacterLookType;
}

export interface CharacterSaveSnapshot {
  readonly characterId: string;
  readonly expectedVersion: number;
  readonly level: number;
  readonly experience: bigint;
  readonly magicLevel: number;
  readonly manaSpent: bigint;
  readonly health: number;
  readonly mana: number;
  readonly soul: number;
  readonly skills: ReadonlyArray<CharacterSkill>;
  readonly progressionDefinitionVersion: number;
  readonly progressionEvents: ReadonlyArray<ProgressionEvent>;
  readonly storageValues: Readonly<Record<string, number>>;
  readonly vocation: CharacterVocation;
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  readonly direction: Direction;
  readonly outfit: CharacterOutfit;
  readonly skull: SkullState;
  readonly skullExpiresAt: Date | null;
  /** Wheel contribution to max stats at snapshot time; absent = no wheel. */
  readonly wheelBonus?: {
    readonly maxHealth: number;
    readonly maxMana: number;
    readonly capacity: number;
  };
}
