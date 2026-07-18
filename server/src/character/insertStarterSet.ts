import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { StarterSet } from "../item/StarterSet";
import { auditStarterItem } from "./auditStarterItem";
import { insertContainerItemQuery } from "./sql/insertContainerItemQuery";
import { insertEquipmentItemQuery } from "./sql/insertEquipmentItemQuery";

export async function insertStarterSet(
  client: PoolClient,
  characterId: string,
  starterSet: StarterSet,
): Promise<void> {
  let backpackId: string | undefined;
  for (const item of starterSet.equipment) {
    const itemId = randomUUID();
    await client.query(insertEquipmentItemQuery, [
      itemId,
      item.typeId,
      item.count ?? 1,
      characterId,
      item.slot,
    ]);
    await auditStarterItem(
      client,
      characterId,
      itemId,
      item.typeId,
      item.count ?? 1,
    );
    if (item.slot === "backpack") backpackId = itemId;
  }
  if (!backpackId && starterSet.backpackContents.length > 0) {
    throw new Error("starter supplies require an equipped backpack");
  }
  for (const [slot, item] of starterSet.backpackContents.entries()) {
    const itemId = randomUUID();
    await client.query(insertContainerItemQuery, [
      itemId,
      item.typeId,
      item.count,
      backpackId,
      slot,
    ]);
    await auditStarterItem(client, characterId, itemId, item.typeId, item.count);
  }
}
