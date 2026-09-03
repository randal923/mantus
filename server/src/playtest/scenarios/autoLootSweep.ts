import { Client } from "pg";
import type {
  InventoryState,
  LootFilter,
  Position,
  ServerMessage,
} from "@tibia/protocol";
import { ParityRig } from "../ParityRig";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Auto-loot sweep e2e: drives real kills over the wire against the real
 * server and checks, per scenario, whether the corpse's drops end up carried.
 * Every scenario reports what the sweep did, and the one that documents an
 * accepted limitation (last-hit ownership) says so in its detail rather than
 * passing quietly.
 *
 *   PLAYTEST_ADMIN_URL=postgres://tibia:tibia_dev_only@127.0.0.1:54329/postgres \
 *     yarn playtest:autoloot
 */

// Fresh dev account per run: accounts cap at 5 characters, and names must be
// letters only. Token must be lowercase.
const TOKEN = `dev-autoloot-${Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 6)}`;
/** Probed non-PZ ground near the Thais spawn (same tile weaponParity uses). */
const SPOT = { x: 32_369, y: 32_260, z: 7 };

const GOLD = 3_031;
const CHEESE = 3_607;
const MEAT = 3_577;
const PLATE_ARMOR = 3_357;
const SUDDEN_DEATH_RUNE = 3_155;
const LOOT_POUCH = 23_721;
const RAT_CORPSE = 5_964;
const CYCLOPS_CORPSE = 5_962;
/**
 * The death blob's corpse ("blob", 11317): a container only through the
 * `overrides/corpses` entry, like the water elemental's remains — but the
 * blob never turns invisible, which the harness reads as `creature-left`.
 */
const DEATH_BLOB_CORPSE = 11_317;
const GLOB_OF_TAR = 9055;
/** Dead troll: seven slots for a twelve-entry table. */
const TROLL_CORPSE = 5_960;
const TROLL_CORPSE_CAPACITY = 7;
/**
 * The minotaur drops that can roll a grade (bronze amulet, sword, axe, mace,
 * brass helmet, chain armor, plate shield).
 */
const MINOTAUR_GRADABLE_DROPS = [
  3_056, 3_264, 3_274, 3_286, 3_354, 3_358, 3_410,
];

interface CheckResult {
  name: string;
  status: "pass" | "fail";
  detail: string;
}

const results: CheckResult[] = [];
const check = (name: string, ok: boolean, detail: string) => {
  results.push({ name, status: ok ? "pass" : "fail", detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name}: ${detail}`);
};
const note = (name: string, detail: string) => {
  console.log(`  ℹ ${name}: ${detail}`);
};

const isType =
  <T extends ServerMessage["type"]>(type: T) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: T }> =>
    m.type === type;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function eventually(
  test: () => boolean,
  timeoutMs = 4_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (test()) return true;
    if (Date.now() >= deadline) return test();
    await sleep(100);
  }
}

/** AUTOLOOT_SCENARIOS=cap,two runs a subset; unset runs everything. */
const selected = process.env.AUTOLOOT_SCENARIOS?.split(",").map((s) => s.trim());
const wanted = (key: string) => !selected || selected.includes(key);

const randomName = (prefix: string) =>
  `${prefix} ${Array.from({ length: 8 }, () =>
    String.fromCharCode(97 + Math.floor(Math.random() * 26)),
  ).join("")}`;

const chebyshev = (a: Position, b: Position) =>
  a.z !== b.z ? Infinity : Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Total of one type across every carried row, pouch included. */
function carriedTotal(inventory: InventoryState, typeId: number): number {
  return (inventory.carried ?? [])
    .filter((entry) => entry.typeId === typeId)
    .reduce((total, entry) => total + entry.count, 0);
}

const carried = (rig: ParityRig, typeId: number) =>
  carriedTotal(rig.inventory, typeId);

/** Sends a filter edit and returns the server's echo or its error code. */
async function setFilter(
  rig: ParityRig,
  filter: LootFilter,
  timeoutMs = 5_000,
): Promise<{ echoed: LootFilter | null; error: string | null }> {
  const since = rig.mark();
  rig.client.send({ type: "update-loot-filter", filter });
  return Promise.race([
    rig.client
      .waitFor(isType("loot-filter-updated"), "loot-filter-updated", {
        since,
        timeoutMs,
      })
      .then((m) => ({ echoed: m.filter, error: null })),
    rig.client
      .waitFor(isType("error"), "loot filter error", { since, timeoutMs })
      .then((m) => ({ echoed: null, error: m.code as string })),
  ]).catch(() => ({ echoed: null, error: "timeout" }));
}

const rules = (typeIds: ReadonlyArray<number>): LootFilter => ({
  enabled: true,
  pickupRules: typeIds.map((typeId) => ({ typeId })),
});

/** Latest known health percent of a creature, from state pushes. */
function healthPercent(rig: ParityRig, creatureId: string): number | null {
  for (let i = rig.client.messages.length - 1; i >= 0; i--) {
    const m = rig.client.messages[i];
    if (m?.type === "creature-health" && m.creatureId === creatureId) {
      return m.healthPercent;
    }
    if (m?.type === "creature-state-changed" && m.creature.id === creatureId) {
      return m.creature.healthPercent;
    }
    if (m?.type === "creature-joined" && m.creature.id === creatureId) {
      return m.creature.healthPercent;
    }
  }
  return null;
}

/**
 * Attacks the creature until it leaves the world (bounded), recording where
 * the killer and the victim stood on the last state seen before death.
 */
async function killAdjacent(
  rig: ParityRig,
  creatureId: string,
  maxRounds = 100,
): Promise<{ killerAt: Position; victimAt: Position | null }> {
  await rig.attackTarget(creatureId);
  let victimAt = rig.creaturePosition(creatureId);
  let killerAt = rig.position;
  for (let round = 0; round < maxRounds && rig.creatureAlive(creatureId); round++) {
    victimAt = rig.creaturePosition(creatureId) ?? victimAt;
    killerAt = rig.position;
    // Melee needs adjacency and the server never auto-walks: close in when
    // the target keeps its distance.
    if (victimAt && chebyshev(killerAt, victimAt) > 1 && round % 4 === 3) {
      const dx = Math.sign(victimAt.x - killerAt.x);
      const dy = Math.sign(victimAt.y - killerAt.y);
      await rig.walkTo(
        { x: victimAt.x - dx, y: victimAt.y - dy, z: victimAt.z },
        4,
      );
      await rig.attackTarget(creatureId).catch(() => undefined);
    }
    await sleep(250);
  }
  await rig.cancelAttack();
  if (rig.creatureAlive(creatureId)) {
    throw new Error(
      `${rig.name}: target survived the bounded kill loop (self ${JSON.stringify(rig.position)}, target ${JSON.stringify(victimAt)} at ${healthPercent(rig, creatureId)}%)`,
    );
  }
  return { killerAt, victimAt };
}

/** Corpse instance on a tile, from the tile pushes seen since `since`. */
function corpseOn(
  rig: ParityRig,
  position: Position,
  corpseTypeId: number,
  since: number,
): { instanceId: string; revision: number } | null {
  let found: { instanceId: string; revision: number } | null = null;
  for (const m of rig.messagesSince(since)) {
    if (m.type !== "tile-states") continue;
    for (const tile of m.visible) {
      if (
        tile.position.x !== position.x ||
        tile.position.y !== position.y ||
        tile.position.z !== position.z
      ) {
        continue;
      }
      const corpse = tile.items.find((item) => item.itemId === corpseTypeId);
      found = corpse
        ? { instanceId: corpse.instanceId, revision: corpse.revision }
        : null;
    }
  }
  return found;
}

/** Where a corpse of that type last appeared in the tile pushes since `since`. */
function corpseTileSince(
  rig: ParityRig,
  corpseTypeId: number,
  since: number,
): Position | null {
  let found: Position | null = null;
  for (const m of rig.messagesSince(since)) {
    if (m.type !== "tile-states") continue;
    for (const tile of m.visible) {
      if (tile.items.some((item) => item.itemId === corpseTypeId)) {
        found = tile.position;
      }
    }
  }
  return found;
}

/** Opens the corpse on the tile (walking next to it first) and lists it. */
async function corpseContents(
  rig: ParityRig,
  position: Position,
): Promise<Array<{ typeId: number; count: number }> | null> {
  const state = await corpseState(rig, position);
  return state?.contents ?? null;
}

/** The corpse window as the server projects it: slot count and contents. */
async function corpseState(
  rig: ParityRig,
  position: Position,
): Promise<{
  capacity: number;
  contents: Array<{ typeId: number; count: number }>;
} | null> {
  if (chebyshev(rig.position, position) > 1) {
    await rig.goto(position.x + 1, position.y, position.z);
    if (chebyshev(rig.position, position) > 1) {
      await rig.walkTo({ x: position.x + 1, y: position.y, z: position.z });
    }
  }
  const since = rig.mark();
  rig.client.send({ type: "use-map", position });
  const state = await Promise.race([
    rig.client
      .waitFor(
        (m): m is Extract<ServerMessage, { type: "world-container-state" }> =>
          m.type === "world-container-state" &&
          m.position.x === position.x &&
          m.position.y === position.y,
        "corpse view",
        { since, timeoutMs: 4_000 },
      )
      .then((m) => m.state),
    rig.client
      .waitFor(isType("error"), "corpse open error", { since, timeoutMs: 4_000 })
      .then(() => null),
  ]).catch(() => null);
  if (!state) return null;
  const contents = state.items.map((entry) => ({
    typeId: entry.item.typeId,
    count: entry.item.count,
  }));
  rig.client.send({
    type: "close-world-container",
    containerId: state.container.id,
  });
  return { capacity: state.capacity, contents };
}

const summarize = (
  contents: ReadonlyArray<{ typeId: number; count: number }> | null,
) =>
  contents === null
    ? "corpse not openable"
    : contents.length === 0
      ? "corpse empty"
      : contents.map((entry) => `${entry.count}x${entry.typeId}`).join(", ");

/** Opens a carried container by item id and returns its listed contents. */
async function openCarried(
  rig: ParityRig,
  itemId: string,
  revision: number,
): Promise<Array<{ id: string; typeId: number; count: number; revision: number }>> {
  const since = rig.mark();
  rig.client.send({ type: "open-container", itemId, revision });
  const updated = await rig.client.waitFor(
    (m): m is Extract<ServerMessage, { type: "inventory-updated" }> =>
      m.type === "inventory-updated" &&
      (m.inventory.containers ?? []).some(
        (container) => container.container.id === itemId,
      ),
    `open container ${itemId}`,
    { since },
  );
  const view = updated.inventory.containers!.find(
    (container) => container.container.id === itemId,
  )!;
  return view.items.map((entry) => ({
    id: entry.item.id,
    typeId: entry.item.typeId,
    count: entry.item.count,
    revision: entry.item.revision,
  }));
}

/** The pouch's contents by opening the bound container, then the pouch. */
async function pouchContents(
  rig: ParityRig,
): Promise<Array<{ typeId: number; count: number }> | null> {
  const bound = rig.equippedItem("bound");
  if (!bound) return null;
  const boundItems = await openCarried(rig, bound.id, bound.revision);
  const pouch = boundItems.find((item) => item.typeId === LOOT_POUCH);
  if (!pouch) return null;
  return openCarried(rig, pouch.id, pouch.revision);
}

function backpackHas(rig: ParityRig, typeId: number): boolean {
  const backpack = rig.equippedItem("backpack");
  const view = (rig.inventory.containers ?? []).find(
    (container) => container.container.id === backpack?.id,
  );
  return (
    rig.inventory.items.some((entry) => entry.item.typeId === typeId) ||
    (view?.items.some((entry) => entry.item.typeId === typeId) ?? false)
  );
}

async function spawnMany(
  rig: ParityRig,
  typeId: string,
  displayName: string,
  count: number,
): Promise<string[]> {
  const since = rig.mark();
  await rig.gm(`/spawn ${typeId} ${count}`);
  await eventually(
    () =>
      rig
        .messagesSince(since)
        .filter(
          (m) => m.type === "creature-joined" && m.creature.name === displayName,
        ).length >= count,
    5_000,
  );
  return rig
    .messagesSince(since)
    .flatMap((m) =>
      m.type === "creature-joined" && m.creature.name === displayName
        ? [m.creature.id]
        : [],
    );
}

async function pouchRowsInDb(
  characterId: string,
): Promise<Array<{ item_type_id: number; count: number }>> {
  const adminUrl =
    process.env.PLAYTEST_ADMIN_URL ??
    "postgres://tibia:tibia_dev_only@localhost:5432/postgres";
  const database = process.env.PLAYTEST_DATABASE ?? "playtest";
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const { rows } = await client.query<{ item_type_id: number; count: number }>(
      `WITH RECURSIVE owned AS (
         SELECT id, item_type_id, count FROM items WHERE character_id = $2
         UNION ALL
         SELECT i.id, i.item_type_id, i.count
           FROM items i JOIN owned o ON i.container_id = o.id
       )
       SELECT c.item_type_id, c.count
         FROM owned p JOIN items c ON c.container_id = p.id
        WHERE p.item_type_id = $1`,
      [LOOT_POUCH, characterId],
    );
    return rows;
  } finally {
    await client.end();
  }
}

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const server = externalUrl
  ? null
  : await startPlaytestServer({
      log: false,
      // Every table entry drops (a rat's 39% cheese becomes certain), and no
      // drop rolls a grade, so gradable gear is always "common".
      lootRate: 50,
      rarityChances: { uncommon: 0, rare: 0, epic: 0, legendary: 0 },
    });
const url = externalUrl ?? server!.url;
let crashed = false;

try {
  console.log("▶ setup (knight, level 100, sword 60)");
  const knightName = randomName("Sweep");
  const knight = await ParityRig.create(url, TOKEN, knightName, "Knight");
  await knight.goto(SPOT.x, SPOT.y, SPOT.z);
  await knight.setupStats({ level: 100, skills: { sword: 60 } });
  const welcome = knight.client.messages.find(isType("welcome"))!;
  check(
    "fresh-character-ships-disabled",
    welcome.lootFilter.enabled === false &&
      welcome.lootFilter.pickupRules.some((rule) => rule.typeId === GOLD),
    `welcome filter enabled=${welcome.lootFilter.enabled}, rules ${JSON.stringify(welcome.lootFilter.pickupRules)}`,
  );

  // ── 1. melee baseline ────────────────────────────────────────────────
  if (wanted("melee")) {
    console.log("▶ scenario: melee kill, gold + cheese listed");
    const set = await setFilter(knight, rules([GOLD, CHEESE]));
    check(
      "filter-update-echoed",
      set.echoed?.enabled === true && set.echoed.pickupRules.length === 2,
      set.error ? `error ${set.error}` : `echo ${JSON.stringify(set.echoed)}`,
    );
    const gold0 = carried(knight, GOLD);
    const cheese0 = carried(knight, CHEESE);
    const since = knight.mark();
    const rat = await knight.spawnMonster("rat", "Rat");
    const { killerAt, victimAt } = await killAdjacent(knight, rat.id);
    const swept = await eventually(
      () => carried(knight, CHEESE) === cheese0 + 1 && carried(knight, GOLD) > gold0,
      3_000,
    );
    check(
      "melee-baseline-sweeps-listed-drops",
      swept,
      `gold ${gold0}→${carried(knight, GOLD)}, cheese ${cheese0}→${carried(knight, CHEESE)}; killer at ${JSON.stringify(killerAt)}, rat at ${JSON.stringify(victimAt)}`,
    );
    const corpseTile = victimAt ?? rat.position;
    const corpse = corpseOn(knight, corpseTile, RAT_CORPSE, since);
    const leftover = corpse ? await corpseContents(knight, corpseTile) : null;
    check(
      "melee-baseline-corpse-emptied",
      corpse !== null && leftover !== null && leftover.length === 0,
      corpse ? summarize(leftover) : "no rat corpse seen on the death tile",
    );
    const pouch = await pouchContents(knight);
    check(
      "sweep-lands-in-loot-pouch-not-backpack",
      pouch !== null &&
        pouch.some((item) => item.typeId === CHEESE) &&
        !backpackHas(knight, CHEESE),
      `pouch: ${summarize(pouch)}; backpack has cheese: ${backpackHas(knight, CHEESE)}`,
    );
  }

  // ── 2. filter disabled ───────────────────────────────────────────────
  if (wanted("disabled")) {
    console.log("▶ scenario: filter disabled → nothing swept");
    await setFilter(knight, { ...rules([GOLD, CHEESE]), enabled: false });
    const cheese0 = carried(knight, CHEESE);
    const since = knight.mark();
    const rat = await knight.spawnMonster("rat", "Rat");
    const { victimAt } = await killAdjacent(knight, rat.id);
    await sleep(600);
    const leftover = await corpseContents(knight, victimAt ?? rat.position);
    check(
      "disabled-filter-leaves-corpse-alone",
      carried(knight, CHEESE) === cheese0 &&
        leftover !== null &&
        leftover.some((entry) => entry.typeId === CHEESE),
      `cheese ${cheese0}→${carried(knight, CHEESE)}; corpse: ${summarize(leftover)} (since mark ${since})`,
    );
  }

  // ── 3. unlisted type stays ───────────────────────────────────────────
  if (wanted("unlisted")) {
    console.log("▶ scenario: only gold listed → cheese stays in the corpse");
    await setFilter(knight, rules([GOLD]));
    const gold0 = carried(knight, GOLD);
    const cheese0 = carried(knight, CHEESE);
    const rat = await knight.spawnMonster("rat", "Rat");
    const { victimAt } = await killAdjacent(knight, rat.id);
    await eventually(() => carried(knight, GOLD) > gold0, 3_000);
    const leftover = await corpseContents(knight, victimAt ?? rat.position);
    check(
      "unlisted-type-stays-in-corpse",
      carried(knight, GOLD) > gold0 &&
        carried(knight, CHEESE) === cheese0 &&
        leftover !== null &&
        leftover.some((entry) => entry.typeId === CHEESE) &&
        !leftover.some((entry) => entry.typeId === GOLD),
      `gold ${gold0}→${carried(knight, GOLD)}, cheese ${cheese0}→${carried(knight, CHEESE)}; corpse: ${summarize(leftover)}`,
    );
  }

  // ── 4. edit immediately before the kill ──────────────────────────────
  if (wanted("edit")) {
    console.log("▶ scenario: filter edited in the same breath as the kill");
    const cheese0 = carried(knight, CHEESE);
    const rat = await knight.spawnMonster("rat", "Rat");
    // No wait for the echo: the in-memory copy must already govern the sweep.
    knight.client.send({ type: "update-loot-filter", filter: rules([GOLD, CHEESE]) });
    await killAdjacent(knight, rat.id);
    const swept = await eventually(() => carried(knight, CHEESE) === cheese0 + 1, 3_000);
    check(
      "edit-before-kill-governs-sweep",
      swept,
      `cheese ${cheese0}→${carried(knight, CHEESE)}`,
    );
  }

  // ── 5. rapid double edit ─────────────────────────────────────────────
  if (wanted("double")) {
    console.log("▶ scenario: two edits back to back (second while first persists)");
    const first = rules([GOLD]);
    const second = rules([GOLD, CHEESE]);
    const since = knight.mark();
    knight.client.send({ type: "update-loot-filter", filter: first });
    knight.client.send({ type: "update-loot-filter", filter: second });
    await sleep(1_500);
    const echoes = knight
      .messagesSince(since)
      .filter(isType("loot-filter-updated"))
      .map((m) => m.filter.pickupRules.length);
    const errors = knight
      .messagesSince(since)
      .filter(isType("error"))
      .map((m) => m.code);
    const last = knight
      .messagesSince(since)
      .filter(isType("loot-filter-updated"))
      .at(-1)?.filter;
    const cheese0 = carried(knight, CHEESE);
    const rat = await knight.spawnMonster("rat", "Rat");
    await killAdjacent(knight, rat.id);
    const sweptSecond = await eventually(() => carried(knight, CHEESE) === cheese0 + 1, 3_000);
    check(
      "rapid-double-edit-last-edit-wins",
      sweptSecond && last?.pickupRules.length === 2 && errors.length === 0,
      `echo rule counts ${JSON.stringify(echoes)}, errors ${JSON.stringify(errors)}, final echoed rules ${last?.pickupRules.length ?? "none"}; cheese ${cheese0}→${carried(knight, CHEESE)} (second edit listed cheese)`,
    );
    // Leave the session in the state the player believes it is in.
    await setFilter(knight, second);
  }

  // ── 6. relog persistence ─────────────────────────────────────────────
  if (wanted("relog")) {
    console.log("▶ scenario: filter survives a relog and still sweeps");
    await setFilter(knight, rules([GOLD, CHEESE]));
    await sleep(500);
    knight.client.terminate();
    await sleep(1_000);
    const again = await ParityRig.create(url, TOKEN, knightName, "Knight");
    const welcomeAgain = again.client.messages.find(isType("welcome"))!;
    const persisted =
      welcomeAgain.lootFilter.enabled &&
      welcomeAgain.lootFilter.pickupRules.some((rule) => rule.typeId === CHEESE);
    await again.goto(SPOT.x, SPOT.y, SPOT.z);
    const cheese0 = carried(again, CHEESE);
    const rat = await again.spawnMonster("rat", "Rat");
    await killAdjacent(again, rat.id);
    const swept = await eventually(() => carried(again, CHEESE) === cheese0 + 1, 3_000);
    check(
      "relog-keeps-filter-and-sweeps",
      persisted && swept,
      `welcome filter enabled=${welcomeAgain.lootFilter.enabled} rules=${welcomeAgain.lootFilter.pickupRules.length}; cheese ${cheese0}→${carried(again, CHEESE)}`,
    );
    // Persisted rows for what the sweeps put in the pouch.
    await sleep(1_000);
    const rows = await pouchRowsInDb(again.playerId);
    const cheeseRows = rows
      .filter((row) => row.item_type_id === CHEESE)
      .reduce((total, row) => total + row.count, 0);
    check(
      "sweeps-persisted-into-pouch-rows",
      cheeseRows === carried(again, CHEESE),
      `db pouch cheese ${cheeseRows}, wire carried cheese ${carried(again, CHEESE)}; pouch rows ${rows.length}`,
    );
    again.client.terminate();
  }

  // ── 7. same-tick multi-kill (AoE) ────────────────────────────────────
  if (wanted("aoe")) {
    console.log("▶ scenario: exori kills several rats in one tick");
    const rig = await ParityRig.create(url, TOKEN, knightName, "Knight");
    await rig.goto(SPOT.x + 2, SPOT.y + 1, SPOT.z);
    await rig.gm("/heal");
    await setFilter(rig, rules([GOLD, CHEESE]));
    const cheese0 = carried(rig, CHEESE);
    const rats = await spawnMany(rig, "rat", "Rat", 5);
    // Let them close in; rats path to the nearest hostile at once.
    await sleep(1_800);
    const adjacentBefore = rats.filter((id) => {
      const at = rig.creaturePosition(id);
      return at !== null && chebyshev(at, rig.position) <= 1;
    }).length;
    const since = rig.mark();
    let cast = await rig.cast("exori", { kind: "self" }, 500);
    if (cast.errorCode) {
      await sleep(1_500);
      cast = await rig.cast("exori", { kind: "self" }, 500);
    }
    await eventually(() => rats.every((id) => !rig.creatureAlive(id)), 2_500);
    const dead = rats.filter((id) => !rig.creatureAlive(id)).length;
    const swept = await eventually(() => carried(rig, CHEESE) === cheese0 + dead, 3_000);
    check(
      "aoe-multi-kill-sweeps-every-corpse",
      dead > 1 && swept,
      `exori error ${cast.errorCode ?? "none"}; ${adjacentBefore} adjacent before cast, ${dead}/${rats.length} died, cheese ${cheese0}→${carried(rig, CHEESE)} (want +${dead})`,
    );
    await rig.gm("/despawn");
    await sleep(1_500);
    const rows = await pouchRowsInDb(rig.playerId);
    const cheeseRows = rows
      .filter((row) => row.item_type_id === CHEESE)
      .reduce((total, row) => total + row.count, 0);
    check(
      "aoe-burst-persisted",
      cheeseRows === carried(rig, CHEESE),
      `db pouch cheese ${cheeseRows}, wire ${carried(rig, CHEESE)}`,
    );
    rig.client.terminate();
  }

  // ── 8. rarity rules on gradable drops ────────────────────────────────
  if (wanted("rarity")) {
    console.log("▶ scenario: grade-narrowed rules against ungraded (common) drops");
    const rig = await ParityRig.create(url, TOKEN, knightName, "Knight");
    await rig.goto(SPOT.x, SPOT.y, SPOT.z);
    await rig.gm("/heal");
    const gradableTotal = () =>
      MINOTAUR_GRADABLE_DROPS.reduce((sum, id) => sum + carried(rig, id), 0);
    // Only legendary wanted: every drop is common, so nothing should move.
    await setFilter(rig, {
      enabled: true,
      pickupRules: MINOTAUR_GRADABLE_DROPS.map((typeId) => ({
        typeId,
        rarities: ["legendary"],
      })),
    });
    const before = gradableTotal();
    const minotaur = await rig.spawnMonster("minotaur", "Minotaur");
    const { victimAt } = await killAdjacent(rig, minotaur.id);
    await sleep(600);
    const leftoverA = await corpseContents(rig, victimAt ?? minotaur.position);
    const gradableLeft = (leftoverA ?? []).filter((e) =>
      MINOTAUR_GRADABLE_DROPS.includes(e.typeId),
    ).length;
    check(
      "legendary-only-rule-skips-common-drops",
      gradableTotal() === before && gradableLeft > 0,
      `carried gradable ${before}→${gradableTotal()}; corpse: ${summarize(leftoverA)}`,
    );
    // Common wanted: the same drops must now be swept.
    await setFilter(rig, {
      enabled: true,
      pickupRules: MINOTAUR_GRADABLE_DROPS.map((typeId) => ({
        typeId,
        rarities: ["common"],
      })),
    });
    const before2 = gradableTotal();
    const minotaur2 = await rig.spawnMonster("minotaur", "Minotaur");
    const kill2 = await killAdjacent(rig, minotaur2.id);
    const swept = await eventually(() => gradableTotal() > before2, 3_000);
    const leftoverB = await corpseContents(rig, kill2.victimAt ?? minotaur2.position);
    check(
      "common-rule-sweeps-ungraded-drops",
      swept &&
        !(leftoverB ?? []).some((e) => MINOTAUR_GRADABLE_DROPS.includes(e.typeId)),
      `carried gradable ${before2}→${gradableTotal()}; corpse: ${summarize(leftoverB)}`,
    );
    await rig.gm("/despawn");
    rig.client.terminate();
  }

  // ── 9. ranged kill (killer not adjacent) ─────────────────────────────
  if (wanted("ranged")) {
    console.log("▶ scenario: sudden death rune kill from range");
    const mage = await ParityRig.create(url, TOKEN, randomName("Mage"), "Sorcerer");
    // Open ground west of the spawn spot: the row south of SPOT is clear for
    // fifteen tiles, so the retreat tile has a walkable route to the corpse.
    // (SPOT + (3, 3) sits in a walled street: unreachable, and rightly not
    // swept.)
    await mage.goto(SPOT.x - 4, SPOT.y + 1, SPOT.z);
    await mage.setupStats({ level: 100, magicLevel: 30 });
    await mage.give(String(SUDDEN_DEATH_RUNE), 10);
    await setFilter(mage, rules([GOLD, MEAT]));
    const meat0 = carried(mage, MEAT);
    const dromedary = await mage.spawnMonster("dromedary", "Dromedary");
    // Step back so the killing blow lands from at least two tiles away.
    const from = mage.position;
    const away = await mage.goto(
      Math.min(dromedary.position.x + 3, SPOT.x + 2),
      SPOT.y + 1,
      SPOT.z,
    );
    let victimAt = mage.creaturePosition(dromedary.id) ?? dromedary.position;
    const distanceAtCast = chebyshev(away, victimAt);
    const since = mage.mark();
    let outcome = await mage.useRune(SUDDEN_DEATH_RUNE, { kind: "creature", creatureId: dromedary.id }, 400);
    for (let attempt = 0; attempt < 4 && mage.creatureAlive(dromedary.id); attempt++) {
      await sleep(2_100);
      outcome = await mage.useRune(SUDDEN_DEATH_RUNE, { kind: "creature", creatureId: dromedary.id }, 400);
    }
    victimAt = mage.creaturePosition(dromedary.id) ?? victimAt;
    const dead = !mage.creatureAlive(dromedary.id);
    const distanceAtDeath = chebyshev(mage.position, victimAt);
    await sleep(600);
    const sweptMeat = carried(mage, MEAT) - meat0;
    const leftover = dead ? await corpseContents(mage, victimAt) : null;
    // Canary `Creature::onDeath`: any corpse the killer can path to is
    // quick-looted, and since 2026-09-02 so is ours — same floor, in view,
    // with a walkable route next to it.
    check(
      "ranged-kill-in-view-is-swept",
      dead && distanceAtDeath >= 2 && sweptMeat > 0 && (leftover?.length ?? 0) === 0,
      `rune error ${outcome.errorCode ?? "none"}; dead=${dead}; distance at cast ${distanceAtCast}, at death ${distanceAtDeath} (started ${JSON.stringify(from)}); meat ${meat0}→${carried(mage, MEAT)}; corpse: ${summarize(leftover)} (since ${since})`,
    );
    await mage.gm("/despawn");
    mage.client.terminate();
  }

  // ── 10. capacity: heavy drop skipped silently, light one taken ───────
  if (wanted("cap")) {
    console.log("▶ scenario: near the weight cap the heavy drop is skipped with a red warning");
    const light = await ParityRig.create(url, TOKEN, randomName("Cap"), "Knight");
    await light.goto(SPOT.x - 2, SPOT.y + 1, SPOT.z);
    // Level 8 keeps the cap small enough that a few plate armors fill it.
    await light.setupStats({ skills: { sword: 60 } });
    await setFilter(light, rules([GOLD, CHEESE]));
    // Plate armors (120 oz) until one more would not fit, then gold coins
    // (0.1 oz) until the free room is below a cheese (8 oz) but above the
    // rat's four coins.
    const room = () =>
      light.inventory.capacityMax * 100 - light.inventory.usedWeight;
    for (let guard = 0; guard < 60 && room() >= 12_000; guard++) {
      await light.give(String(PLATE_ARMOR));
    }
    for (let guard = 0; guard < 40 && room() >= 700; guard++) {
      const coins = Math.min(100, Math.max(1, Math.floor((room() - 300) / 10)));
      await light.give(String(GOLD), coins);
    }
    const freeBefore = room();
    const gold0 = carried(light, GOLD);
    const cheese0 = carried(light, CHEESE);
    const since = light.mark();
    const rat = await light.spawnMonster("rat", "Rat");
    const { victimAt } = await killAdjacent(light, rat.id);
    await eventually(() => carried(light, GOLD) > gold0, 3_000);
    const leftover = await corpseContents(light, victimAt ?? rat.position);
    const errorsSeen = light
      .messagesSince(since)
      .filter(isType("error"))
      .map((m) => m.code);
    const warnings = light
      .messagesSince(since)
      .filter(isType("combat-log"))
      .filter((m) => m.kind === "warning")
      .map((m) => m.text);
    check(
      "weight-cap-skips-heavy-drop-takes-light-one",
      freeBefore < 800 &&
        carried(light, GOLD) > gold0 &&
        carried(light, CHEESE) === cheese0 &&
        leftover !== null &&
        leftover.some((e) => e.typeId === CHEESE),
      `free room ${freeBefore}/100 oz before kill; gold ${gold0}→${carried(light, GOLD)}, cheese ${cheese0}→${carried(light, CHEESE)}; corpse: ${summarize(leftover)}; errors on the wire: ${JSON.stringify(errorsSeen)}`,
    );
    // Canary `playerQuickLootCorpse`: one "Attention!" line per sweep that
    // skipped something for weight; the client draws it red centre-screen.
    check(
      "weight-cap-skip-warns-once-in-red",
      warnings.length === 1 &&
        warnings[0] ===
          "Attention! The loot you are trying to pick up is too heavy for you to carry.",
      `warnings on the wire: ${JSON.stringify(warnings)}`,
    );
    light.client.terminate();
  }

  // ── 11. two killers: most damage vs last hit ─────────────────────────
  if (wanted("two")) {
    console.log("▶ scenario: A deals most damage, B lands the last hit");
    const a = await ParityRig.create(url, TOKEN, randomName("Alpha"), "Knight");
    // One live session per account: the second killer needs its own account.
    const b = await ParityRig.create(url, `${TOKEN}b`, randomName("Bravo"), "Knight");
    await a.goto(SPOT.x + 1, SPOT.y - 2, SPOT.z);
    // Both wield the starter steel axe; A's weaker skill makes the cyclops
    // take several hits so the hand-off can happen below half health.
    await a.setupStats({ level: 100, skills: { axe: 30 } });
    await b.setupStats({ level: 100, skills: { axe: 60 } });
    await setFilter(a, rules([GOLD, MEAT]));
    await setFilter(b, rules([GOLD, MEAT]));
    const goldA0 = carried(a, GOLD);
    const goldB0 = carried(b, GOLD);
    const cyclops = await a.spawnMonster("cyclops", "Cyclops");
    await a.attackTarget(cyclops.id);
    const worn = await eventually(() => {
      const hp = healthPercent(a, cyclops.id);
      return hp !== null && hp <= 45;
    }, 30_000);
    await a.cancelAttack();
    const hpAtHandoff = healthPercent(a, cyclops.id);
    const cyclopsAt = a.creaturePosition(cyclops.id) ?? cyclops.position;
    await b.goto(cyclopsAt.x + 1, cyclopsAt.y + 1, cyclopsAt.z);
    const seenByB = await b.client
      .waitForCreatureNamed("Cyclops", { timeoutMs: 5_000 })
      .catch(() => null);
    let killedByB = false;
    let bAtDeath = b.position;
    let corpseAt = cyclopsAt;
    if (seenByB && worn) {
      const kill = await killAdjacent(b, seenByB.id, 60).catch(() => null);
      killedByB = kill !== null;
      bAtDeath = kill?.killerAt ?? b.position;
      corpseAt = kill?.victimAt ?? cyclopsAt;
    }
    await sleep(800);
    const aGot = carried(a, GOLD) - goldA0;
    const bGot = carried(b, GOLD) - goldB0;
    const aDistance = chebyshev(a.position, corpseAt);
    const bDistance = chebyshev(bAtDeath, corpseAt);
    check(
      "last-hitter-owns-and-sweeps (deviation: Canary gives most-damage)",
      killedByB && bGot > 0 && aGot === 0,
      `cyclops at ${hpAtHandoff}% when A stopped; B killed=${killedByB}; A got ${aGot} gold (distance ${aDistance}), B got ${bGot} gold (distance ${bDistance})`,
    );
    const leftover = killedByB ? await corpseContents(a, corpseAt) : null;
    check(
      "corpse-protected-from-most-damage-dealer",
      killedByB && leftover === null,
      !killedByB
        ? "no kill by B, nothing to check"
        : leftover === null
          ? "A cannot open the corpse B owns (loot-protected)"
          : `A opened the corpse: ${summarize(leftover)}`,
    );
    await a.gm("/despawn");
    a.client.terminate();
    b.client.terminate();
  }

  // ── 12. monster whose corpse cannot hold loot ─────────────────────────
  // ── 13. a table longer than the corpse: every drop lands ─────────────
  if (wanted("overflow")) {
    console.log("▶ scenario: troll (twelve-entry table, seven-slot corpse)");
    const rig = await ParityRig.create(url, TOKEN, knightName, "Knight");
    await rig.goto(SPOT.x, SPOT.y, SPOT.z);
    await rig.setupStats({ skills: { axe: 60 } });
    // Sweep off so the corpse keeps everything it rolled.
    await setFilter(rig, { enabled: false, pickupRules: [] });
    const since = rig.mark();
    const troll = await rig.spawnMonster("troll", "Troll");
    const { victimAt } = await killAdjacent(rig, troll.id, 240);
    await sleep(800);
    // The troll keeps moving while it dies; trust the tile push that shows
    // the corpse over the last position the kill loop saw.
    const tile = corpseTileSince(rig, TROLL_CORPSE, since) ?? victimAt ?? troll.position;
    const view = await corpseState(rig, tile);
    // Nine of the troll's twelve entries are certain at the ×50 rate, so the
    // roll must exceed the seven slots; the window is sized to the contents.
    check(
      "loot-table-longer-than-corpse-drops-in-full",
      view !== null &&
        view.contents.length > TROLL_CORPSE_CAPACITY &&
        view.capacity >= view.contents.length,
      `corpse ${TROLL_CORPSE} (${TROLL_CORPSE_CAPACITY} slots): ${view?.contents.length ?? "?"} drops, window ${view?.capacity ?? "?"} slots — ${summarize(view?.contents ?? null)}`,
    );
    await rig.gm("/despawn");
    rig.client.terminate();
  }

  if (wanted("nocorpse")) {
    console.log("▶ scenario: death blob (corpse type is a container only by override)");
    const rig = await ParityRig.create(url, TOKEN, knightName, "Knight");
    await rig.goto(SPOT.x, SPOT.y, SPOT.z);
    await rig.setupStats({ skills: { axe: 60 } });
    await setFilter(rig, rules([GLOB_OF_TAR]));
    const tar0 = carried(rig, GLOB_OF_TAR);
    const since = rig.mark();
    const blob = await rig.spawnMonster("death-blob", "Death Blob");
    const { victimAt } = await killAdjacent(rig, blob.id, 240);
    await sleep(800);
    const tile = victimAt ?? blob.position;
    const corpse = corpseOn(rig, tile, DEATH_BLOB_CORPSE, since);
    const leftover = corpse ? await corpseContents(rig, tile) : null;
    // 11317 carries the DAT container flag with no items.xml size (capacity 0
    // in the generated catalog); `overrides/corpses` gives it Canary's default
    // eight slots, and the corpse grows to its loot anyway. Its one entry
    // (glob of tar, 18.47%) is certain at the ×50 rate.
    check(
      "override-container-corpse-holds-and-sweeps-loot",
      corpse !== null && carried(rig, GLOB_OF_TAR) > tar0 && leftover !== null,
      `corpse item on tile: ${corpse ? "yes" : "no"}; glob of tar ${tar0}→${carried(rig, GLOB_OF_TAR)}; corpse view: ${summarize(leftover)}`,
    );
    await rig.gm("/despawn");
    rig.client.terminate();
  }
} catch (cause) {
  crashed = true;
  console.error("\nSCENARIO CRASH:", cause);
} finally {
  const failures = results.filter((result) => result.status === "fail");
  console.log(
    `\n${results.length - failures.length} passed, ${failures.length} failed`,
  );
  for (const failure of failures) {
    console.log(`  ✗ ${failure.name}: ${failure.detail}`);
  }
  await server?.stop();
  process.exit(crashed || failures.length > 0 ? 1 : 0);
}
