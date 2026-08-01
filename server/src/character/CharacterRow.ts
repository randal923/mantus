import type { Character } from "./Character";

export interface CharacterRow {
  id: string;
  account_id: string;
  display_name: string;
  normalized_name: string;
  vocation: Character["vocation"];
  /** Canary PlayerSex_t: 0 = female, 1 = male. */
  sex: number;
  level: number;
  experience: string;
  magic_level: number;
  mana_spent: string;
  health: number;
  mana: number;
  soul: number;
  stamina: number;
  last_seen_at: Date;
  progression_definition_version: number;
  position_x: number;
  position_y: number;
  position_z: number;
  direction: Character["direction"];
  outfit_look_type: Character["outfit"]["lookType"];
  outfit_head: number;
  outfit_body: number;
  outfit_legs: number;
  outfit_feet: number;
  outfit_addons: number;
  town_id: number;
  action_bar: unknown;
  potion_action_bar: unknown;
  loot_filter: unknown;
  hunting_bot: unknown;
  aim_at_target_spells: unknown;
  skull: number;
  skull_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
  namelocked: boolean;
  mount_id: number;
  version: number;
}
