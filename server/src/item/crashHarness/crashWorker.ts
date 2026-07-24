// Child process for the process-kill durability harness
// (PgItemCrashHarness.integration.test.ts). Performs one memory-first
// ownership move (planMoveToContainer → store.persist), which runs inside
// withSerializableTransaction. When ITEM_TX_CRASH_POINT is set, that wrapper
// SIGKILLs this process at the commit boundary, proving abrupt death leaves
// exactly one durable item location. This file is never imported by the game
// server; it is spawned only by the harness.
import { Pool } from "pg";
import { loadItemCatalog } from "../loadItemCatalog";
import { PgItemStore } from "../PgItemStore";
import { planMoveToContainer } from "../plan/planMoveToContainer";

async function main(): Promise<void> {
  const {
    ITEM_TX_DATABASE_URL,
    ITEM_TX_SCHEMA,
    ITEM_TX_CHARACTER_ID,
    ITEM_TX_ITEM_ID,
    ITEM_TX_DEST_CONTAINER_ID,
    ITEM_TX_DEST_SLOT,
  } = process.env;
  if (
    !ITEM_TX_DATABASE_URL ||
    !ITEM_TX_SCHEMA ||
    !ITEM_TX_CHARACTER_ID ||
    !ITEM_TX_ITEM_ID ||
    !ITEM_TX_DEST_CONTAINER_ID ||
    ITEM_TX_DEST_SLOT === undefined
  ) {
    throw new Error("crash worker missing required ITEM_TX_* env");
  }

  const pool = new Pool({
    connectionString: ITEM_TX_DATABASE_URL,
    options: `-c search_path=${ITEM_TX_SCHEMA}`,
  });
  const catalog = await loadItemCatalog();
  const store = new PgItemStore(pool, catalog, "crash-harness");
  const carried = await store.loadForCharacter(ITEM_TX_CHARACTER_ID);
  const item = carried.find((candidate) => candidate.id === ITEM_TX_ITEM_ID);
  const destination = carried.find(
    (candidate) => candidate.id === ITEM_TX_DEST_CONTAINER_ID,
  );
  if (!item || !destination) {
    throw new Error("crash worker could not load the move item/destination");
  }

  const plan = planMoveToContainer({
    characterId: ITEM_TX_CHARACTER_ID,
    catalog,
    items: carried,
    itemId: item.id,
    expectedVersion: item.version,
    destinationContainerId: destination.id,
    destinationVersion: destination.version,
    destinationSlot: Number(ITEM_TX_DEST_SLOT),
  });
  if (!plan) throw new Error("crash worker move plan was rejected");

  // Runs inside withSerializableTransaction; when a crash point is injected the
  // wrapper announces the boundary on stdout and blocks for the harness kill.
  await store.persist(plan.persist);
  await pool.end();
}

main().then(
  () => process.exit(0),
  (cause: unknown) => {
    console.error(cause);
    process.exit(1);
  },
);
