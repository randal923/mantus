import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: every key door in door-keys.json, played end to end the way a
 * player would: find the chest that yields the key with the door's ActionId,
 * loot it, carry the key to the door, use the key on the door, and walk
 * through the opened door. Doors whose key exists in no chest table are
 * recorded as findings (their key must come from an NPC, monster, or quest
 * step that is not implemented yet) rather than failures.
 *
 * Runs against its own dedicated database (dropped and recreated every run)
 * so doors are always in their pristine locked state. Run with:
 * yarn workspace server playtest:quest-doors
 */

const SWEEP_DATABASE = "playtest_quest_doors";
const ADMIN_URL =
  process.env.PLAYTEST_ADMIN_URL ??
  "postgres://tibia:tibia_dev_only@localhost:5432/postgres";

type Vec3 = { x: number; y: number; z: number };

interface DoorEntry {
  actionId: number;
  positions: Vec3[];
}

interface ChestSource {
  uniqueId: number;
  position: Vec3;
  lootedKey: string;
  keyTypeId: number;
  /** Set when the chest wraps its rewards in a granted container. */
  containerTypeId?: number;
}

interface Finding {
  actionId: number;
  position: Vec3 | null;
  category:
    | "no-key-source"
    | "key-chest-failed"
    | "door-unreachable"
    | "key-did-not-match"
    | "door-did-not-open"
    | "door-not-passable";
  detail: string;
}

const dataUrl = (name: string) =>
  fileURLToPath(new URL(`../../../data/${name}`, import.meta.url));

const doorsDocument = JSON.parse(readFileSync(dataUrl("door-keys.json"), "utf8")) as {
  doors: { actionId: number; positions: Vec3[] }[];
};
const doors: DoorEntry[] = doorsDocument.doors.map((door) => ({
  actionId: door.actionId,
  positions: door.positions,
}));

const chestDocuments = ["chests.json", "quest-chests.json"].flatMap(
  (name) =>
    (
      JSON.parse(readFileSync(dataUrl(name), "utf8")) as {
        chests: {
          uniqueId: number;
          positions: Vec3[];
          lootedKey: string;
          reward: { typeId: number; count: number; actionId?: number }[];
          containerTypeId?: number;
        }[];
      }
    ).chests,
);

/** The first chest whose reward carries the door's ActionId. */
function findKeySource(actionId: number): ChestSource | null {
  for (const chest of chestDocuments) {
    const reward = chest.reward.find((entry) => entry.actionId === actionId);
    if (reward) {
      return {
        uniqueId: chest.uniqueId,
        position: chest.positions[0]!,
        lootedKey: chest.lootedKey,
        keyTypeId: reward.typeId,
        ...(chest.containerTypeId === undefined
          ? {}
          : { containerTypeId: chest.containerTypeId }),
      };
    }
  }
  return null;
}

const suffix = [...String(Date.now() % 1_000_000)]
  .map((digit) => "abcdefghij"[Number(digit)])
  .join("");
const step = (text: string) => console.log(`\n▶ ${text}`);
const ok = (text: string) => console.log(`  ✓ ${text}`);
const useExhaust = () => new Promise((resolve) => setTimeout(resolve, 450));

const externalUrl = process.env.PLAYTEST_SERVER_URL;
if (!externalUrl) {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${SWEEP_DATABASE} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
  process.env.PLAYTEST_DATABASE = SWEEP_DATABASE;
}
const server = externalUrl ? null : await startPlaytestServer({ log: false });
const url = externalUrl ?? server!.url;
const findings: Finding[] = [];
let opened = 0;

async function goto(c: PlaytestClient, position: Vec3) {
  const before = c.mark();
  c.say(`/goto ${position.x} ${position.y} ${position.z}`);
  const reply = await c.waitFor(
    (m): m is Extract<typeof m, { type: "gm-response" }> =>
      m.type === "gm-response",
    `gm-response for /goto ${position.x} ${position.y} ${position.z}`,
    { since: before },
  );
  if (!reply.ok) throw new Error(`/goto failed: ${reply.text}`);
  return reply.text;
}

async function gotoBeside(c: PlaytestClient, target: Vec3) {
  const attempts: string[] = [];
  for (const candidate of [
    { x: target.x, y: target.y + 1, z: target.z },
    { x: target.x, y: target.y - 1, z: target.z },
    { x: target.x - 1, y: target.y, z: target.z },
    { x: target.x + 1, y: target.y, z: target.z },
  ]) {
    try {
      const reply = await goto(c, candidate);
      const landed = /Position: (\d+), (\d+), (\d+)\./.exec(reply);
      if (landed) {
        const at = {
          x: Number(landed[1]),
          y: Number(landed[2]),
          z: Number(landed[3]),
        };
        if (
          at.z === target.z &&
          Math.abs(at.x - target.x) <= 1 &&
          Math.abs(at.y - target.y) <= 1
        ) {
          return at;
        }
      }
      attempts.push(`(${candidate.x},${candidate.y}): landed "${reply}"`);
    } catch (error) {
      attempts.push(`(${candidate.x},${candidate.y}): ${String(error)}`);
    }
  }
  throw new Error(`no walkable tile within reach:\n  ${attempts.join("\n  ")}`);
}

/** Heals the sweeper: chests and doors sit in spawn areas. */
async function heal(c: PlaytestClient) {
  const before = c.mark();
  c.say("/heal");
  await c.waitFor(
    (m): m is Extract<typeof m, { type: "gm-response" }> =>
      m.type === "gm-response",
    "gm-response for /heal",
    { since: before },
  );
}

try {
  step(`sweeping ${doors.length} key doors against ${url}`);
  const client = await PlaytestClient.connect(url);
  await client.enter(`dev-door-sweep-${suffix}`, `Door Sweep ${suffix}`);
  {
    // Level gates on some key doors would otherwise mask the key mechanics.
    const before = client.mark();
    client.say("/level 150");
    await client.waitFor(
      (m): m is Extract<typeof m, { type: "gm-response" }> =>
        m.type === "gm-response" && m.ok,
      "gm-response for /level 150",
      { since: before },
    );
  }

  // Keys already granted this run, keyed by the chest's lootedKey (two chests
  // can share one lootedKey and grant the same key once).
  const carriedKeys = new Map<string, { itemId: string; revision: number }>();
  const knownKeyIds = new Set<string>();

  for (const [index, door] of doors.entries()) {
    const label = `door aid=${door.actionId}`;
    const record = (
      category: Finding["category"],
      position: Vec3 | null,
      detail: string,
    ) => {
      findings.push({ actionId: door.actionId, position, category, detail });
      console.log(`  ✗ [${index + 1}/${doors.length}] ${label}: ${category} — ${detail}`);
    };

    const source = findKeySource(door.actionId);
    if (!source) {
      record(
        "no-key-source",
        door.positions[0] ?? null,
        "no chest in chests.json/quest-chests.json rewards a key with this ActionId",
      );
      continue;
    }

    // 1. Obtain the key (once per shared lootedKey). Retried once: monster
    //    aggro can drag the sweeper out of reach before the use lands.
    let key = carriedKeys.get(source.lootedKey);
    if (!key) {
      try {
        let found: { text: string } | null = null;
        let beforeLoot = client.mark();
        for (let attempt = 0; attempt < 2 && !found; attempt++) {
          await gotoBeside(client, source.position);
          await heal(client);
          await useExhaust();
          beforeLoot = client.mark();
          client.send({ type: "use-map", position: source.position });
          try {
            found = await client.waitFor(
              (m): m is Extract<typeof m, { type: "combat-log" }> =>
                m.type === "combat-log" && /^You have found |is empty\.$/.test(m.text),
              "chest outcome",
              { since: beforeLoot, timeoutMs: 5_000 },
            );
          } catch {
            found = null;
          }
        }
        if (!found) {
          record(
            "key-chest-failed",
            source.position,
            `chest ${source.uniqueId}: no grant within timeout`,
          );
          continue;
        }
        if (!/^You have found /.test(found.text)) {
          record(
            "key-chest-failed",
            source.position,
            `chest ${source.uniqueId} said: "${found.text}"`,
          );
          continue;
        }
        // A container chest grants a bag holding the key; the key only shows
        // up after opening that bag. A plain chest grants the key top-level.
        const lookFor = source.containerTypeId ?? source.keyTypeId;
        const carried = await client.waitFor(
          (m): m is Extract<typeof m, { type: "inventory-updated" }> =>
            m.type === "inventory-updated" &&
            m.inventory.items.some(
              (entry) =>
                entry.item.typeId === lookFor && !knownKeyIds.has(entry.item.id),
            ),
          "inventory holding the fresh key (or its container)",
          { since: beforeLoot, timeoutMs: 4_000 },
        );
        const entry = carried.inventory.items.find(
          (candidate) =>
            candidate.item.typeId === lookFor &&
            !knownKeyIds.has(candidate.item.id),
        )!;
        knownKeyIds.add(entry.item.id);
        if (source.containerTypeId === undefined) {
          key = { itemId: entry.item.id, revision: entry.item.revision };
        } else {
          const beforeOpen = client.mark();
          client.send({
            type: "open-container",
            itemId: entry.item.id,
            revision: entry.item.revision,
          });
          const opened = await client.waitFor(
            (m): m is Extract<typeof m, { type: "inventory-updated" }> =>
              m.type === "inventory-updated" &&
              (m.inventory.containers ?? []).some(
                (container) =>
                  container.container.id === entry.item.id &&
                  container.items.some(
                    (slot) => slot.item.typeId === source.keyTypeId,
                  ),
              ),
            "opened reward bag with the key inside",
            { since: beforeOpen, timeoutMs: 4_000 },
          );
          const bag = (opened.inventory.containers ?? []).find(
            (container) => container.container.id === entry.item.id,
          )!;
          const slot = bag.items.find(
            (candidate) => candidate.item.typeId === source.keyTypeId,
          )!;
          key = { itemId: slot.item.id, revision: slot.item.revision };
          knownKeyIds.add(slot.item.id);
        }
        carriedKeys.set(source.lootedKey, key);
        ok(
          `[${index + 1}/${doors.length}] ${label}: key ${source.keyTypeId} from chest ${source.uniqueId}`,
        );
      } catch (error) {
        record(
          "key-chest-failed",
          source.position,
          `chest ${source.uniqueId}: ${String(error).split("\n")[0]}`,
        );
        continue;
      }
    }

    // 2. Use the key on every door position; walk through the first one.
    for (const [positionIndex, position] of door.positions.entries()) {
      const doorLabel = `${label} @(${position.x},${position.y},${position.z})`;
      let stand: Vec3;
      try {
        stand = await gotoBeside(client, position);
      } catch (error) {
        record("door-unreachable", position, String(error).split("\n")[0] ?? "");
        continue;
      }
      // A pristine door is a static map item, so tile-states does not cover
      // its tile at all until the key transforms it into a world item; the
      // first covering snapshot after the use IS the unlock.
      await heal(client);
      await useExhaust();
      const beforeUnlock = client.mark();
      client.send({
        type: "use-item-with",
        itemId: key.itemId,
        revision: key.revision,
        targetPosition: position,
      });
      try {
        const changed = await client.waitFor(
          (m): m is Extract<typeof m, { type: "tile-states" }> =>
            m.type === "tile-states" &&
            m.visible.some(
              (tile) =>
                tile.position.x === position.x &&
                tile.position.y === position.y &&
                tile.position.z === position.z,
            ),
          "door transform after the key use",
          { since: beforeUnlock, timeoutMs: 4_000 },
        );
        const doorTile = changed.visible.find(
          (tile) =>
            tile.position.x === position.x &&
            tile.position.y === position.y &&
            tile.position.z === position.z,
        )!;
        ok(
          `${doorLabel}: transformed, tile now holds [${doorTile.items
            .map((item) => item.itemId)
            .join(", ")}]`,
        );
      } catch {
        const said = client.messages
          .slice(beforeUnlock)
          .find((m) => m.type === "combat-log");
        if (said && said.type === "combat-log" && said.text === "The key does not match.") {
          record("key-did-not-match", position, `key from chest ${source.uniqueId}`);
        } else {
          record(
            "door-did-not-open",
            position,
            said && said.type === "combat-log"
              ? `said: "${said.text}"`
              : "no tile change and no message after the key use",
          );
        }
        continue;
      }
      opened++;
      console.log(`  ✓ [${index + 1}/${doors.length}] ${doorLabel}: unlocked`);

      // A single cardinal step can only land on the door when the stand tile
      // is cardinally adjacent; gotoBeside may have landed diagonally.
      const cardinal =
        Math.abs(position.x - stand.x) + Math.abs(position.y - stand.y) === 1;
      if (positionIndex === 0 && cardinal) {
        const direction =
          stand.y < position.y
            ? "south"
            : stand.y > position.y
              ? "north"
              : stand.x < position.x
                ? "east"
                : "west";
        const beforeStep = client.mark();
        client.send({ type: "move", direction, queueStep: true });
        try {
          await client.waitFor(
            (m): m is Extract<typeof m, { type: "creature-moved" }> =>
              m.type === "creature-moved" &&
              m.creatureId === client.playerId &&
              m.position.x === position.x &&
              m.position.y === position.y &&
              m.position.z === position.z,
            "step onto the opened door tile",
            { since: beforeStep, timeoutMs: 3_000 },
          );
          ok(`${doorLabel}: walked through`);
        } catch {
          record("door-not-passable", position, "opened but the step was refused");
        }
      }
    }
  }

  step("door sweep summary");
  console.log(
    `  doors: ${doors.length}, positions unlocked: ${opened}, findings: ${findings.length}`,
  );
  for (const finding of findings) {
    const at = finding.position
      ? `pos=(${finding.position.x},${finding.position.y},${finding.position.z})`
      : "pos=?";
    console.log(
      `  FINDING door=${finding.actionId} ${at} ${finding.category}: ${finding.detail}`,
    );
  }
  console.log(
    `DOOR_REPORT_JSON ${JSON.stringify({ total: doors.length, opened, findings })}`,
  );
  const hardFailures = findings.filter((f) => f.category !== "no-key-source");
  if (hardFailures.length > 0) {
    console.error(`\nFAIL: ${hardFailures.length} door(s) misbehaved`);
  } else {
    console.log(
      `\nPASS: every reachable key door opens with its chest key (${
        findings.length
      } without any chest key source)`,
    );
  }
  client.terminate();
  process.exitCode = hardFailures.length > 0 ? 1 : 0;
} catch (error) {
  console.error("\nFAIL:", error);
  process.exitCode = 1;
} finally {
  await server?.stop();
}
