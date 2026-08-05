import type {
  EquipmentSlot,
  ItemContainerDestination,
  Position,
} from "@tibia/protocol";
import type { ImbuementCatalog } from "../imbuement/ImbuementCatalog";
import type { Item } from "./Item";
import type { CarriedPersistPlan } from "./CarriedPersistPlan";
import type { ConjureItemResult } from "./ConjureItemResult";
import type { ItemMutation } from "./ItemMutation";
import type { LootItemCreation } from "./LootItemCreation";
import type { PotionUseRequest } from "./PotionUseRequest";
import type { PotionUseResult } from "./PotionUseResult";
import type { WorldItemDeltas } from "./WorldItemDeltas";
import type { WorldItemSource } from "./WorldItemSource";

export interface ItemStore {
  /**
   * Lets the Pg store fold Featherweight into transactional capacity checks;
   * optional because an in-memory store derives nothing from the database.
   */
  setImbuementCatalog?(catalog: ImbuementCatalog): void;
  loadForCharacter(characterId: string): Promise<ReadonlyArray<Item>>;
  /**
   * How long each of the character's item rows has been unchanged, on the
   * database clock. Optional: an in-memory store has no durable clock, and a
   * missing age simply arms a full decay duration.
   */
  carriedAgesMs?(characterId: string): Promise<ReadonlyMap<string, number>>;
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
    /** Pick up directly into an empty equipment slot. */
    equipSlot?: EquipmentSlot,
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
  /**
   * Spends up to `count` charges in one transaction; the item is destroyed
   * when the last charge goes. Fewer than `count` are spent when that is all
   * the item has left, so the caller reads what it actually cost from the
   * mutation rather than assuming.
   */
  consumeCharges(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    count: number,
  ): Promise<ItemMutation>;
  usePotion(request: PotionUseRequest): Promise<PotionUseResult>;
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
    /** Attribute bag born with the item (dev-only rarity conjuring). */
    attributes?: Readonly<Record<string, unknown>>,
  ): Promise<ConjureItemResult>;
  decayWorldItem(
    itemId: string,
    expectedVersion: number,
  ): Promise<ItemMutation>;
  /**
   * Drops the rows behind ground items the periodic map clean removed from
   * memory, contents included, with an `item-destroyed` audit per row.
   */
  removeCleanedWorldItems(itemIds: ReadonlyArray<string>): Promise<void>;
  loadWorldDeltas(
    mapName: string,
    mapVersion: string,
  ): Promise<WorldItemDeltas>;
  /** Flushes a committed in-memory carried mutation as one transaction. */
  persist(plan: CarriedPersistPlan): Promise<void>;
}
