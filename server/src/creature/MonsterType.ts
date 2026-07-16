import type { CreatureOutfit } from "@tibia/protocol";

export interface MonsterType {
  id: string;
  name: string;
  description: string;
  outfit: CreatureOutfit;
  health: number;
  maxHealth: number;
  speed: number;
  experience: number;
  corpseItemTypeId: number;
  flags: {
    attackable: boolean;
    hostile: boolean;
    pushable: boolean;
    summonable: boolean;
    convinceable: boolean;
    illusionable: boolean;
    canPushItems: boolean;
    canPushCreatures: boolean;
    targetDistance: number;
    runHealth: number;
  };
  targetStrategy: {
    nearest: number;
    health: number;
    damage: number;
    random: number;
  };
  attacks: ReadonlyArray<Readonly<Record<string, string | number | boolean>>>;
  defenses: ReadonlyArray<Readonly<Record<string, string | number | boolean>>>;
  elements: Readonly<Record<string, number>>;
  immunities: ReadonlyArray<string>;
  summons: ReadonlyArray<Readonly<Record<string, string | number | boolean>>>;
  voices: ReadonlyArray<Readonly<Record<string, string | number | boolean>>>;
  loot: ReadonlyArray<Readonly<Record<string, string | number | boolean>>>;
}
