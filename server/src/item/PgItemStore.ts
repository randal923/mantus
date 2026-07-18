import type {
  EquipmentSlot,
  ItemContainerDestination,
  Position,
} from "@tibia/protocol";
import type { Pool } from "pg";
import type { Item } from "./Item";
import type { ConjureItemResult } from "./ConjureItemResult";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemMutation } from "./ItemMutation";
import type { ItemStore } from "./ItemStore";
import type { LootItemCreation } from "./LootItemCreation";
import { PgContainerMoveOps } from "./PgContainerMoveOps";
import { PgDecayOps } from "./PgDecayOps";
import { PgEquipmentOps } from "./PgEquipmentOps";
import { PgItemAudit } from "./PgItemAudit";
import { PgItemCreationOps } from "./PgItemCreationOps";
import { PgItemGuards } from "./PgItemGuards";
import { PgItemLocks } from "./PgItemLocks";
import { PgItemReads } from "./PgItemReads";
import { PgItemUseOps } from "./PgItemUseOps";
import { PgStackOps } from "./PgStackOps";
import { PgWorldItemMaterializer } from "./PgWorldItemMaterializer";
import { PgWorldItemOps } from "./PgWorldItemOps";
import type { WorldItemDeltas } from "./WorldItemDeltas";
import type { WorldItemSource } from "./WorldItemSource";

export class PgItemStore implements ItemStore {
  private readonly reads: PgItemReads;
  private readonly equipment: PgEquipmentOps;
  private readonly world: PgWorldItemOps;
  private readonly containerMoves: PgContainerMoveOps;
  private readonly stacks: PgStackOps;
  private readonly uses: PgItemUseOps;
  private readonly creations: PgItemCreationOps;
  private readonly decays: PgDecayOps;

  constructor(pool: Pool, catalog: ItemCatalog, mapName: string) {
    const locks = new PgItemLocks(catalog, mapName);
    const guards = new PgItemGuards(catalog);
    const audit = new PgItemAudit();
    const materializer = new PgWorldItemMaterializer(catalog, mapName, locks);
    this.reads = new PgItemReads(pool);
    this.equipment = new PgEquipmentOps(pool, catalog, locks, guards, audit);
    this.world = new PgWorldItemOps(
      pool,
      catalog,
      mapName,
      locks,
      guards,
      audit,
      materializer,
    );
    this.containerMoves = new PgContainerMoveOps(
      pool,
      catalog,
      locks,
      guards,
      audit,
    );
    this.stacks = new PgStackOps(pool, catalog, locks, guards, audit);
    this.uses = new PgItemUseOps(pool, catalog, locks, guards, audit);
    this.creations = new PgItemCreationOps(
      pool,
      catalog,
      mapName,
      locks,
      guards,
      audit,
    );
    this.decays = new PgDecayOps(pool, catalog, locks, audit);
  }

  loadForCharacter(characterId: string): Promise<ReadonlyArray<Item>> {
    return this.reads.loadForCharacter(characterId);
  }

  equip(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    slot: EquipmentSlot,
  ): Promise<ItemMutation> {
    return this.equipment.equip(characterId, itemId, expectedVersion, slot);
  }

  unequip(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    slot: EquipmentSlot,
    destination?: ItemContainerDestination,
  ): Promise<ItemMutation> {
    return this.equipment.unequip(
      characterId,
      itemId,
      expectedVersion,
      slot,
      destination,
    );
  }

  pickup(
    characterId: string,
    itemReference: string,
    expectedVersion: number,
    position: Position,
    source?: WorldItemSource,
    destination?: ItemContainerDestination,
  ): Promise<ItemMutation> {
    return this.world.pickup(
      characterId,
      itemReference,
      expectedVersion,
      position,
      source,
      destination,
    );
  }

  drop(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    position: Position,
    requestedCount?: number,
  ): Promise<ItemMutation> {
    return this.world.drop(
      characterId,
      itemId,
      expectedVersion,
      position,
      requestedCount,
    );
  }

  moveWorldItem(
    characterId: string,
    itemReference: string,
    expectedVersion: number,
    fromPosition: Position,
    toPosition: Position,
    source?: WorldItemSource,
  ): Promise<ItemMutation> {
    return this.world.moveWorldItem(
      characterId,
      itemReference,
      expectedVersion,
      fromPosition,
      toPosition,
      source,
    );
  }

  split(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    count: number,
  ): Promise<ItemMutation> {
    return this.stacks.split(characterId, itemId, expectedVersion, count);
  }

  rotate(
    characterId: string,
    itemId: string,
    expectedVersion: number,
  ): Promise<ItemMutation> {
    return this.stacks.rotate(characterId, itemId, expectedVersion);
  }

  moveToContainer(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    destinationContainerId: string,
    destinationVersion: number,
    destinationSlot: number,
    requestedCount?: number,
  ): Promise<ItemMutation> {
    return this.containerMoves.moveToContainer(
      characterId,
      itemId,
      expectedVersion,
      destinationContainerId,
      destinationVersion,
      destinationSlot,
      requestedCount,
    );
  }

  writeText(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    text: string,
  ): Promise<ItemMutation> {
    return this.uses.writeText(characterId, itemId, expectedVersion, text);
  }

  consume(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    count: number,
    reason: "rune" | "ammunition" | "break" | "food",
  ): Promise<ItemMutation> {
    return this.uses.consume(
      characterId,
      itemId,
      expectedVersion,
      count,
      reason,
    );
  }

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
  ): Promise<ConjureItemResult> {
    return this.creations.conjure(
      characterId,
      expectedCharacterVersion,
      expectedMana,
      expectedSoul,
      manaCost,
      soulCost,
      sourceItemTypeId,
      targetItemTypeId,
      count,
    );
  }

  createCorpse(
    characterId: string | null,
    eventId: string,
    position: Position,
    stackIndex: number,
    corpseTypeId: number,
    loot: ReadonlyArray<LootItemCreation>,
  ): Promise<ReadonlyArray<Item>> {
    return this.creations.createCorpse(
      characterId,
      eventId,
      position,
      stackIndex,
      corpseTypeId,
      loot,
    );
  }

  decayWorldItem(
    itemId: string,
    expectedVersion: number,
  ): Promise<ItemMutation> {
    return this.decays.decayWorldItem(itemId, expectedVersion);
  }

  loadWorldDeltas(
    mapName: string,
    mapVersion: string,
  ): Promise<WorldItemDeltas> {
    return this.reads.loadWorldDeltas(mapName, mapVersion);
  }
}
