import type {
  ActionBar,
  ActionBotSettings,
  CharacterLookType,
  CharacterSex,
  CharacterVocation,
  Direction,
  LootFilter,
  StarterVocation,
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
  /** Fixed at creation; decides which half of the outfit catalog applies. */
  readonly sex: CharacterSex;
  readonly level: number;
  readonly experience: bigint;
  readonly magicLevel: number;
  readonly manaSpent: bigint;
  readonly health: number;
  readonly mana: number;
  readonly soul: number;
  /** Stamina in minutes (Canary: 0..2520). */
  readonly stamina: number;
  /** Wall-clock time of the last durable save; null for an unsaved character. */
  readonly lastSeenAt: Date | null;
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
  readonly actionBotSettings: ActionBotSettings;
  /** Auto-loot blacklist plus its on/off switch. */
  readonly lootFilter: LootFilter;
  /** Spell ids whose direction cast aims at the live attack target. */
  readonly aimAtTargetSpellIds: ReadonlyArray<string>;
  readonly skull: SkullState;
  readonly skullExpiresAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastLoginAt: Date | null;
  /** Blocks world entry until the character is renamed (Feature 67). */
  readonly namelocked: boolean;
  /** Mount being ridden (0 = none); owned by the outfit entitlements. */
  readonly mountId: number;
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
  readonly sex: CharacterSex;
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
  readonly stamina: number;
  /** Wall-clock time of this save; drives offline accrual on next login. */
  readonly lastSeenAt: Date;
  readonly skills: ReadonlyArray<CharacterSkill>;
  /** False lets the store skip rewriting rows that match the last save. */
  readonly skillsChanged: boolean;
  readonly progressionDefinitionVersion: number;
  readonly progressionEvents: ReadonlyArray<ProgressionEvent>;
  readonly storageValues: Readonly<Record<string, number>>;
  /** False lets the store skip the storage delete + reinsert entirely. */
  readonly storageChanged: boolean;
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
