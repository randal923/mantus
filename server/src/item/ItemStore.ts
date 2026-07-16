import type { EquipmentSlot, Position } from "@tibia/protocol";
import type { Item } from "./Item";
import type { ItemMutation } from "./ItemMutation";
import type { LootItemCreation } from "./LootItemCreation";
import type { WorldItemDeltas } from "./WorldItemDeltas";
import type { WorldItemSource } from "./WorldItemSource";

export interface ItemStore {
  loadForCharacter(characterId: string): Promise<ReadonlyArray<Item>>;
  equip(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    slot: EquipmentSlot,
  ): Promise<ItemMutation>;
  unequip(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    slot: EquipmentSlot,
  ): Promise<ItemMutation>;
  pickup(
    characterId: string,
    itemReference: string,
    expectedVersion: number,
    position: Position,
    source?: WorldItemSource,
  ): Promise<ItemMutation>;
  drop(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    position: Position,
    count?: number,
  ): Promise<ItemMutation>;
  split(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    count: number,
  ): Promise<ItemMutation>;
  rotate(
    characterId: string,
    itemId: string,
    expectedVersion: number,
  ): Promise<ItemMutation>;
  consume(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    count: number,
    reason: "rune" | "ammunition" | "break",
  ): Promise<ItemMutation>;
  createCorpse(
    characterId: string | null,
    eventId: string,
    position: Position,
    stackIndex: number,
    corpseTypeId: number,
    loot: ReadonlyArray<LootItemCreation>,
  ): Promise<ReadonlyArray<Item>>;
  loadWorldDeltas(
    mapName: string,
    mapVersion: string,
  ): Promise<WorldItemDeltas>;
}
