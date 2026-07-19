import type {
  EquipmentSlot,
  ItemContainerDestination,
  Position,
} from "@tibia/protocol";
import type { Item } from "./Item";
import type { CarriedPersistPlan } from "./CarriedPersistPlan";
import type { ConjureItemResult } from "./ConjureItemResult";
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
    destination?: ItemContainerDestination,
  ): Promise<ItemMutation>;
  pickup(
    characterId: string,
    itemReference: string,
    expectedVersion: number,
    position: Position,
    source?: WorldItemSource,
    destination?: ItemContainerDestination,
    /** Stage on a loose inventory slot (equip-after-pickup needs no backpack). */
    stageInInventory?: boolean,
  ): Promise<ItemMutation>;
  drop(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    position: Position,
    count?: number,
  ): Promise<ItemMutation>;
  moveWorldItem(
    characterId: string,
    itemReference: string,
    expectedVersion: number,
    fromPosition: Position,
    toPosition: Position,
    source?: WorldItemSource,
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
  moveToContainer(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    destinationContainerId: string,
    destinationVersion: number,
    destinationSlot: number,
    count?: number,
  ): Promise<ItemMutation>;
  writeText(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    text: string,
  ): Promise<ItemMutation>;
  consume(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    count: number,
    reason: "rune" | "ammunition" | "break" | "food",
  ): Promise<ItemMutation>;
  conjure(
    characterId: string,
    expectedCharacterVersion: number,
    expectedMana: number,
    expectedSoul: number,
    manaCost: number,
    soulCost: number,
    sourceItemTypeId: number,
    targetItemTypeId: number,
    count: number,
  ): Promise<ConjureItemResult>;
  decayWorldItem(
    itemId: string,
    expectedVersion: number,
  ): Promise<ItemMutation>;
  loadWorldDeltas(
    mapName: string,
    mapVersion: string,
  ): Promise<WorldItemDeltas>;
  /** Flushes a committed in-memory carried mutation as one transaction. */
  persist(plan: CarriedPersistPlan): Promise<void>;
}
