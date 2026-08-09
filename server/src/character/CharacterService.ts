import { randomUUID } from "node:crypto";
import {
  CHARACTER_SEXES,
  STARTER_LOOK_TYPE_BY_SEX,
  createDefaultActionBar,
  DEFAULT_ACTION_BOT_SETTINGS,
  DEFAULT_HUNTING_BOT_ROUTE,
  DEFAULT_LOOT_FILTER,
  MAX_CHARACTERS_PER_ACCOUNT,
  MAX_STAMINA_MINUTES,
  STARTER_VOCATIONS,
  type CharacterCreationOptions,
  type CharacterSummary as PublicCharacterSummary,
  type OwnCharacterState,
  type Position,
} from "@tibia/protocol";
import type { Player } from "../Player";
import type { Character, CreateCharacterInput } from "./Character";
import { CharacterError } from "./CharacterError";
import type { CharacterStore } from "./CharacterStore";
import { getStarterSet } from "../item/getStarterSet";
import { createInitialSkills } from "../progression/createInitialSkills";
import { deriveCharacterStats } from "../progression/deriveCharacterStats";
import { getVocation } from "../progression/getVocation";
import { PROGRESSION_DEFINITION_VERSION } from "../progression/progressionDefinitionVersion";
import {
  projectOwnProgression,
  type ExperienceRateConfig,
} from "../progression/projectOwnProgression";
import { normalizeCharacterName } from "./normalizeCharacterName";
import { monotonicNow } from "../monotonicNow";

interface StarterPosition extends Position {
  townId: number;
}

const STARTER_OUTFIT_COLORS = {
  head: 78,
  body: 68,
  legs: 58,
  feet: 76,
  addons: 0,
} as const;

export class CharacterService {
  constructor(
    private readonly store: CharacterStore,
    private readonly starter: StarterPosition,
    private readonly experienceRates: ExperienceRateConfig = {
      baseRate: 1,
      stages: [],
    },
  ) {}

  creationOptions(): CharacterCreationOptions {
    return {
      vocations: [...STARTER_VOCATIONS],
      sexes: [...CHARACTER_SEXES],
      maxCharacters: MAX_CHARACTERS_PER_ACCOUNT,
    };
  }

  async list(accountId: string): Promise<PublicCharacterSummary[]> {
    const characters = await this.store.listByAccountId(accountId);
    return characters.map((character) => ({
      id: character.id,
      name: character.displayName,
      vocation: character.vocation,
      level: character.level,
      outfit: character.outfit,
      lastLoginAt: character.lastLoginAt?.toISOString() ?? null,
      namelocked: false,
      mountId: 0,
    }));
  }

  async create(
    accountId: string,
    input: CreateCharacterInput,
  ): Promise<PublicCharacterSummary[]> {
    const name = normalizeCharacterName(input.displayName);
    if (!name) throw new CharacterError("name-invalid");
    const options = this.creationOptions();
    if (
      !options.vocations.includes(input.vocation) ||
      !options.sexes.includes(input.sex)
    ) {
      throw new CharacterError("name-invalid");
    }
    const existing = await this.store.listByAccountId(accountId);
    if (existing.length >= MAX_CHARACTERS_PER_ACCOUNT) {
      throw new CharacterError("limit-reached");
    }
    const now = new Date(monotonicNow());
    const stats = deriveCharacterStats({
      vocation: input.vocation,
      definitionVersion: PROGRESSION_DEFINITION_VERSION,
      level: 1,
    });
    const character: Character = {
      id: randomUUID(),
      accountId,
      displayName: name.displayName,
      normalizedName: name.normalizedName,
      vocation: input.vocation,
      sex: input.sex,
      level: 1,
      experience: 0n,
      magicLevel: 0,
      manaSpent: 0n,
      health: stats.maxHealth,
      mana: stats.maxMana,
      soul: getVocation(
        input.vocation,
        PROGRESSION_DEFINITION_VERSION,
      ).maxSoul,
      stamina: MAX_STAMINA_MINUTES,
      blessings: 0,
      lastSeenAt: null,
      skills: createInitialSkills(),
      progressionDefinitionVersion: PROGRESSION_DEFINITION_VERSION,
      progressionEventIds: [],
      storageValues: {},
      positionX: this.starter.x,
      positionY: this.starter.y,
      positionZ: this.starter.z,
      direction: "south",
      outfit: {
        lookType: STARTER_LOOK_TYPE_BY_SEX[input.sex],
        ...STARTER_OUTFIT_COLORS,
      },
      townId: this.starter.townId,
      actionBar: createDefaultActionBar(),
      actionBotSettings: { ...DEFAULT_ACTION_BOT_SETTINGS, rules: [] },
      lootFilter: { ...DEFAULT_LOOT_FILTER, pickupRules: [] },
      huntingBotRoute: { ...DEFAULT_HUNTING_BOT_ROUTE, waypoints: [] },
      aimAtTargetSpellIds: [],
      skull: "none",
      skullExpiresAt: null,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
      namelocked: false,
      mountId: 0,
      version: 1,
    };
    await this.store.create(
      character,
      MAX_CHARACTERS_PER_ACCOUNT,
      getStarterSet(input.vocation),
    );
    return this.list(accountId);
  }

  findForSelection(
    accountId: string,
    characterId: string,
  ): Promise<Character | null> {
    return this.store.findByIdForAccount(accountId, characterId);
  }

  recordLogin(
    accountId: string,
    characterId: string,
    loggedInAt: Date,
  ): Promise<void> {
    return this.store.recordLogin(accountId, characterId, loggedInAt);
  }

  ownState(player: Player, now: number): OwnCharacterState {
    return {
      id: player.id,
      name: player.name,
      vocation: player.vocation,
      ...projectOwnProgression(player, now, this.experienceRates),
      position: { ...player.position },
      direction: player.direction,
      outfit: player.outfit,
      townId: player.townId,
      lastLoginAt: player.lastLoginAt?.toISOString() ?? null,
    };
  }
}
