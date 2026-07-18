import type { Character } from "./Character";

export interface CharacterRow {
  id: string;
  account_id: string;
  display_name: string;
  normalized_name: string;
  vocation: Character["vocation"];
  level: number;
  experience: string;
  magic_level: number;
  mana_spent: string;
  health: number;
  mana: number;
  soul: number;
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
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
  version: number;
}
