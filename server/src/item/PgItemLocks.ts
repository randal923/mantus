import {
  computeWheelBonuses,
  GEM_QUALITIES,
  WHEEL_DOMAINS,
  type EquipmentSlot,
  type Position,
  type RevealedGem,
} from "@tibia/protocol";
import type { PoolClient } from "pg";
import { deriveCharacterStats } from "../progression/deriveCharacterStats";
import { selectGemGradesQuery } from "../wheel/sql/selectGemGradesQuery";
import { selectGemRowsQuery } from "../wheel/sql/selectGemRowsQuery";
import { selectWheelSlicesQuery } from "../wheel/sql/selectWheelSlicesQuery";
import type { CharacterItemRow } from "./CharacterItemRow";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemRow } from "./ItemRow";
import { requireRow } from "./requireRow";
import { containerSlotIndexesQuery } from "./sql/containerSlotIndexesQuery";
import { lockBackpackQuery } from "./sql/lockBackpackQuery";
import { lockCharacterQuery } from "./sql/lockCharacterQuery";
import { lockContainerMergeTargetQuery } from "./sql/lockContainerMergeTargetQuery";
import { lockContainerSlotQuery } from "./sql/lockContainerSlotQuery";
import { lockEquipmentSlotQuery } from "./sql/lockEquipmentSlotQuery";
import { lockItemByReferenceQuery } from "./sql/lockItemByReferenceQuery";
import { lockItemsQuery } from "./sql/lockItemsQuery";
import { lockOwnedItemByTypeQuery } from "./sql/lockOwnedItemByTypeQuery";
import { lockWorldMergeTargetQuery } from "./sql/lockWorldMergeTargetQuery";
import { stagingSlotIndexesQuery } from "./sql/stagingSlotIndexesQuery";
import { worldStackIndexesQuery } from "./sql/worldStackIndexesQuery";

export class PgItemLocks {
  constructor(
    private readonly catalog: ItemCatalog,
    private readonly mapName: string,
  ) {}

  async lockCharacter(
    client: PoolClient,
    characterId: string,
  ): Promise<CharacterItemRow> {
    const result = await client.query<Omit<CharacterItemRow, "capacity">>(
      lockCharacterQuery,
      [characterId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("character not found");
    return {
      ...row,
      capacity: deriveCharacterStats({
        vocation: row.vocation,
        definitionVersion: row.progression_definition_version,
        level: row.level,
        wheel: await this.wheelCapacityBonus(client, characterId, row),
      }).capacity,
    };
  }

  /**
   * The wheel's capacity contribution for an *offline* character, read
   * inside the same transaction so offline deliveries (mail, market) apply
   * the same capacity limit the character has while online. Uses the shared
   * `computeWheelBonuses`, so the online and offline numbers cannot drift.
   */
  private async wheelCapacityBonus(
    client: PoolClient,
    characterId: string,
    row: Omit<CharacterItemRow, "capacity">,
  ): Promise<{ capacity: number }> {
    const slices = await client.query<{ slices: number[] }>(
      selectWheelSlicesQuery,
      [characterId],
    );
    const gems = await client.query<{
      id: string;
      domain: number;
      quality: number;
      basic_mod_1: number;
      basic_mod_2: number | null;
      supreme_mod: number | null;
      locked: boolean;
      equipped: boolean;
    }>(selectGemRowsQuery, [characterId]);
    const grades = await client.query<{
      mod_kind: number;
      mod_id: number;
      grade: number;
    }>(selectGemGradesQuery, [characterId]);
    const allocation = slices.rows[0]?.slices ?? [];
    const equipped: RevealedGem[] = [];
    for (const gem of gems.rows) {
      const domain = WHEEL_DOMAINS[gem.domain];
      const quality = GEM_QUALITIES[gem.quality];
      if (!gem.equipped || !domain || !quality) continue;
      equipped.push({
        id: gem.id,
        domain,
        quality,
        locked: gem.locked,
        basicModIds:
          gem.basic_mod_2 === null
            ? [gem.basic_mod_1]
            : [gem.basic_mod_1, gem.basic_mod_2],
        ...(gem.supreme_mod === null ? {} : { supremeModId: gem.supreme_mod }),
      });
    }
    return {
      capacity: computeWheelBonuses(allocation, row.vocation, {
        equipped,
        grades: {
          basic: grades.rows
            .filter((grade) => grade.mod_kind === 0)
            .map((grade) => ({ modId: grade.mod_id, grade: grade.grade })),
          supreme: grades.rows
            .filter((grade) => grade.mod_kind === 1)
            .map((grade) => ({ modId: grade.mod_id, grade: grade.grade })),
        },
      }).capacity,
    };
  }

  async lockItem(client: PoolClient, reference: string): Promise<ItemRow> {
    const row = await this.findLockedItem(client, reference);
    if (!row) throw new Error("item not found");
    return row;
  }

  async findLockedItem(
    client: PoolClient,
    reference: string,
  ): Promise<ItemRow | undefined> {
    const result = await client.query<ItemRow>(lockItemByReferenceQuery, [
      reference,
    ]);
    if (result.rows.length > 1) throw new Error("item reference is ambiguous");
    return result.rows[0];
  }

  async lockItems(
    client: PoolClient,
    itemIds: ReadonlyArray<string>,
  ): Promise<Map<string, ItemRow>> {
    const uniqueIds = [...new Set(itemIds)].sort();
    const result = await client.query<ItemRow>(lockItemsQuery, [uniqueIds]);
    return new Map(result.rows.map((row) => [row.id, row]));
  }

  async lockOwnedItemByType(
    client: PoolClient,
    characterId: string,
    itemTypeId: number,
  ): Promise<ItemRow | undefined> {
    const result = await client.query<ItemRow>(lockOwnedItemByTypeQuery, [
      characterId,
      itemTypeId,
    ]);
    return result.rows[0];
  }

  async lockEquipmentSlot(
    client: PoolClient,
    characterId: string,
    slot: EquipmentSlot,
    excludedItemId: string,
  ): Promise<ItemRow | undefined> {
    const result = await client.query<ItemRow>(lockEquipmentSlotQuery, [
      characterId,
      slot,
      excludedItemId,
    ]);
    return result.rows[0];
  }

  async lockBackpack(
    client: PoolClient,
    characterId: string,
  ): Promise<ItemRow> {
    const result = await client.query<ItemRow>(lockBackpackQuery, [
      characterId,
    ]);
    const row = requireRow(result.rows[0]);
    if ((this.catalog.require(row.item_type_id).containerCapacity ?? 0) < 1) {
      throw new Error("equipped backpack is not a container");
    }
    return row;
  }

  async lockContainerSlot(
    client: PoolClient,
    containerId: string,
    slot: number,
  ): Promise<ItemRow | undefined> {
    const result = await client.query<ItemRow>(lockContainerSlotQuery, [
      containerId,
      slot,
    ]);
    return result.rows[0];
  }

  async lockContainerMergeTarget(
    client: PoolClient,
    containerId: string,
    source: ItemRow,
    count = source.count,
  ): Promise<ItemRow | undefined> {
    const type = this.catalog.require(source.item_type_id);
    const result = await client.query<ItemRow>(lockContainerMergeTargetQuery, [
      containerId,
      source.item_type_id,
      JSON.stringify(source.attributes),
      count,
      type.maxCount,
      source.id,
    ]);
    return result.rows[0];
  }

  async lockWorldMergeTarget(
    client: PoolClient,
    position: Position,
    source: ItemRow,
  ): Promise<ItemRow | undefined> {
    const type = this.catalog.require(source.item_type_id);
    const result = await client.query<ItemRow>(lockWorldMergeTargetQuery, [
      this.mapName,
      position.x,
      position.y,
      position.z,
      source.item_type_id,
      JSON.stringify(source.attributes),
      source.count,
      type.maxCount,
    ]);
    return result.rows[0];
  }

  async firstContainerSlot(
    client: PoolClient,
    container: ItemRow,
  ): Promise<number> {
    const capacity =
      this.catalog.require(container.item_type_id).containerCapacity ?? 0;
    const occupied = await client.query<{ slot_index: number }>(
      containerSlotIndexesQuery,
      [container.id],
    );
    const slots = new Set(occupied.rows.map((row) => row.slot_index));
    const slot = Array.from({ length: capacity }, (_, index) => index).find(
      (index) => !slots.has(index),
    );
    if (slot === undefined) throw new Error("container is full");
    return slot;
  }

  async firstStagingSlot(
    client: PoolClient,
    characterId: string,
  ): Promise<number> {
    const occupied = await client.query<{ slot_index: number }>(
      stagingSlotIndexesQuery,
      [characterId],
    );
    const slots = new Set(occupied.rows.map((row) => row.slot_index));
    const slot = Array.from({ length: 100 }, (_, index) => index).find(
      (index) => !slots.has(index),
    );
    if (slot === undefined) throw new Error("item transaction staging area is full");
    return slot;
  }

  async firstWorldSlot(
    client: PoolClient,
    position: Position,
  ): Promise<number> {
    const occupied = await client.query<{ world_stack_index: number }>(
      worldStackIndexesQuery,
      [this.mapName, position.x, position.y, position.z],
    );
    const slots = new Set(occupied.rows.map((row) => row.world_stack_index));
    const slot = Array.from({ length: 16 }, (_, index) => index).find(
      (index) => !slots.has(index),
    );
    if (slot === undefined) throw new Error("world tile has too many items");
    return slot;
  }
}
