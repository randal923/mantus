import type { PoolClient } from "pg";
import { auditStarterItemQuery } from "./sql/auditStarterItemQuery";

export async function auditStarterItem(
  client: PoolClient,
  characterId: string,
  itemId: string,
  itemTypeId: number,
  count: number,
): Promise<void> {
  await client.query(auditStarterItemQuery, [
    characterId,
    itemId,
    itemTypeId,
    count,
  ]);
}
