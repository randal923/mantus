import { Client } from "pg";
import { loadChestDefinitions } from "../../action/loadChestDefinitions";
import type { ChestDefinition } from "../../action/ChestDefinition";
import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: every placed quest chest in the game, played end to end. For each
 * chest in chests.json + quest-chests.json the sweep teleports beside it,
 * verifies the chest item actually exists on the map tile, uses it, expects
 * the "You have found ..." grant (or the empty line when another chest with
 * the same lootedKey was already claimed this run), verifies the reward
 * landed in the inventory, and uses the chest again expecting the empty
 * line. Nothing aborts the run: every deviation is recorded and the full
 * findings list is printed (and exits nonzero) at the end.
 *
 * The sweep runs against its own dedicated database (dropped and recreated
 * every run) so world state and looted flags from earlier runs can never
 * bleed into the assertions. Characters rotate every few chests to keep
 * inventory slots and carry capacity from distorting outcomes.
 *
 * Run with: yarn workspace server playtest:quest-chests
 */

const SWEEP_DATABASE = "playtest_quest_sweep";
const ADMIN_URL =
  process.env.PLAYTEST_ADMIN_URL ??
  "postgres://tibia:tibia_dev_only@localhost:5432/postgres";
// Rewards accumulate in the backpack's ~20 top-level slots; too many chests
// per character turns slot pressure into false "no room" refusals.
const CHESTS_PER_CHARACTER = 6;
const OUTCOME_TIMEOUT_MS = 5_000;

type Vec3 = { x: number; y: number; z: number };

interface Finding {
  uniqueId: number;
  position: Vec3;
  category:
    | "unreachable"
    | "no-outcome"
    | "empty-on-first-use"
    | "error-response"
    | "too-heavy"
    | "no-room"
    | "reward-not-in-inventory"
    | "reuse-not-empty";
  detail: string;
}

const suffix = [...String(Date.now() % 1_000_000)]
  .map((digit) => "abcdefghij"[Number(digit)])
  .join("");
const letters = (n: number) => {
  let value = n;
  let out = "";
  do {
    out = "abcdefghijklmnopqrstuvwxyz"[value % 26] + out;
    value = Math.floor(value / 26);
  } while (value > 0);
  return out;
};

const step = (text: string) => console.log(`\n▶ ${text}`);
const ok = (text: string) => console.log(`  ✓ ${text}`);
const useExhaust = () => new Promise((resolve) => setTimeout(resolve, 450));

const externalUrl = process.env.PLAYTEST_SERVER_URL;
if (!externalUrl) {
  // A pristine database every run: chest looted flags are per character and
  // the sweep mints fresh characters anyway, but door/lever/world item rows
  // persisting across runs would make tile assertions ambiguous.
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

// The loader keys definitions by position ("z:x,y"); collapse to one entry
// per uniqueId, keeping the first placed position.
const chests: { definition: ChestDefinition; position: Vec3 }[] = [];
{
  const seen = new Set<number>();
  for (const [key, definition] of loadChestDefinitions("otservbr")) {
    if (seen.has(definition.uniqueId)) continue;
    seen.add(definition.uniqueId);
    const match = /^(\d+):(\d+),(\d+)$/.exec(key);
    if (!match) throw new Error(`unparseable chest position key: ${key}`);
    chests.push({
      definition,
      position: {
        x: Number(match[2]),
        y: Number(match[3]),
        z: Number(match[1]),
      },
    });
  }
}
const findings: Finding[] = [];
let looted = 0;
let sharedEmpty = 0;
let clientsSpawned = 0;
let client: PlaytestClient | null = null;

async function nextClient(): Promise<PlaytestClient> {
  const index = clientsSpawned++;
  const fresh = await PlaytestClient.connect(url);
  await fresh.enter(
    `dev-chest-sweep-${suffix}-${index}`,
    `Sweep ${suffix} ${letters(index)}`,
  );
  // Carry capacity scales with level; a level-1 character would turn heavy
  // rewards into capacity refusals that say nothing about the chest itself.
  const before = fresh.mark();
  fresh.say("/level 150");
  await fresh.waitFor(
    (m): m is Extract<typeof m, { type: "gm-response" }> =>
      m.type === "gm-response" && m.ok,
    "gm-response for /level 150",
    { since: before },
  );
  return fresh;
}

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

/** Teleports within use-map reach of `target`; throws when nothing lands. */
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
  throw new Error(
    `no walkable tile within reach:\n  ${attempts.join("\n  ")}`,
  );
}

/** Heals the sweeper: chests sit in spawn areas and aggro adds up. */
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

type OutcomeKind = "found" | "empty" | "too-heavy" | "no-room" | "error";

/**
 * First *recognized* chest outcome after `since`. Ambient combat-log lines
 * (monsters attacking the sweeper, field damage) are skipped, not
 * misattributed to the chest; they are returned for diagnostics when no
 * recognized outcome arrives at all.
 */
async function useOutcome(
  c: PlaytestClient,
  since: number,
): Promise<{ kind: OutcomeKind; text: string } | { kind: null; ambient: string[] }> {
  const classify = (text: string): OutcomeKind | null => {
    if (/too heavy for you to carry\.$/.test(text)) return "too-heavy";
    if (/no room to take it\.$/.test(text)) return "no-room";
    if (/^You have found /.test(text)) return "found";
    if (/is empty\.$/.test(text)) return "empty";
    return null;
  };
  const deadline = Date.now() + OUTCOME_TIMEOUT_MS;
  const ambient: string[] = [];
  let cursor = since;
  for (;;) {
    for (; cursor < c.messages.length; cursor++) {
      const message = c.messages[cursor]!;
      if (message.type === "error") {
        return { kind: "error", text: message.code };
      }
      if (message.type !== "combat-log") continue;
      const kind = classify(message.text);
      if (kind) return { kind, text: message.text };
      ambient.push(message.text);
    }
    if (Date.now() > deadline) return { kind: null, ambient };
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// Container chests grant a bag holding the rewards, so only the bag itself
// appears in the top-level carried items.
const rewardTypeIds = (chest: ChestDefinition) =>
  chest.containerTypeId !== undefined
    ? [chest.containerTypeId]
    : [
        ...chest.reward.map((entry) => entry.typeId),
        ...(chest.randomReward?.map((entry) => entry.typeId) ?? []),
      ];

try {
  step(`sweeping ${chests.length} chests against ${url}`);
  const lootedKeysSeen = new Map<string, number>();
  let chestsOnCurrentClient = 0;
  client = await nextClient();

  for (const [index, { definition: chest, position }] of chests.entries()) {
    if (chestsOnCurrentClient >= CHESTS_PER_CHARACTER) {
      client.terminate();
      client = await nextClient();
      chestsOnCurrentClient = 0;
    }
    chestsOnCurrentClient++;
    const label = `chest ${chest.uniqueId} @(${position.x},${position.y},${position.z})`;
    const record = (category: Finding["category"], detail: string) => {
      findings.push({ uniqueId: chest.uniqueId, position, category, detail });
      console.log(`  ✗ [${index + 1}/${chests.length}] ${label}: ${category} — ${detail}`);
    };

    // 1. Use the chest, retrying once: monster aggro can drag the sweeper
    //    out of reach between the teleport and the use.
    let beforeUse = client.mark();
    let outcome: Awaited<ReturnType<typeof useOutcome>> | null = null;
    let reachable = false;
    for (let attempt = 0; attempt < 2 && !outcome?.kind; attempt++) {
      try {
        await gotoBeside(client, position);
        reachable = true;
      } catch (error) {
        if (attempt === 1 && !reachable) {
          record("unreachable", String(error).split("\n")[0] ?? "goto failed");
        }
        continue;
      }
      await heal(client);
      await useExhaust();
      beforeUse = client.mark();
      client.send({ type: "use-map", position });
      outcome = await useOutcome(client, beforeUse);
    }
    if (!reachable) continue;
    const priorClaim = lootedKeysSeen.get(chest.lootedKey);
    if (!outcome || !outcome.kind) {
      const ambient = outcome?.ambient ?? [];
      record(
        "no-outcome",
        ambient.length > 0
          ? `no chest response; ambient lines: ${ambient.slice(0, 3).join(" | ")}`
          : "no chest response and no combat-log at all",
      );
      continue;
    }
    if (outcome.kind === "error") {
      record("error-response", outcome.text);
      continue;
    }
    if (outcome.kind === "empty") {
      if (priorClaim !== undefined) {
        sharedEmpty++;
        console.log(
          `  · [${index + 1}/${chests.length}] ${label}: empty (lootedKey shared with chest ${priorClaim})`,
        );
      } else {
        record("empty-on-first-use", outcome.text);
      }
      continue;
    }
    if (outcome.kind === "too-heavy") {
      record("too-heavy", outcome.text);
      continue;
    }
    if (outcome.kind === "no-room") {
      record("no-room", outcome.text);
      continue;
    }
    lootedKeysSeen.set(chest.lootedKey, chest.uniqueId);

    // 2. The granted reward must be carried now.
    const candidates = rewardTypeIds(chest);
    try {
      // Grants land in the first free slot, which mid-window can be inside
      // the starter bag; the carried summary sees closed-bag contents where
      // the top-level slot list cannot.
      await client.waitFor(
        (m): m is Extract<typeof m, { type: "inventory-updated" }> =>
          m.type === "inventory-updated" &&
          (m.inventory.items.some((entry) =>
            candidates.includes(entry.item.typeId),
          ) ||
            (m.inventory.carried ?? []).some((entry) =>
              candidates.includes(entry.typeId),
            )),
        "inventory holding the chest reward",
        { since: beforeUse, timeoutMs: 4_000 },
      );
    } catch {
      record(
        "reward-not-in-inventory",
        `said "${outcome.text}" but no carried item of type ${candidates.join("/")}`,
      );
      continue;
    }

    // 3. Second use: once per character means the empty line now.
    await useExhaust();
    const beforeReuse = client.mark();
    client.send({ type: "use-map", position });
    const reuse = await useOutcome(client, beforeReuse);
    if (reuse.kind !== "empty") {
      record(
        "reuse-not-empty",
        reuse.kind ? `${reuse.kind}: ${reuse.text}` : "no outcome within timeout",
      );
      continue;
    }
    looted++;
    console.log(
      `  ✓ [${index + 1}/${chests.length}] ${label}: "${outcome.text}" then empty`,
    );
  }

  // The quest log is the "beginning to end" view of quests proper: chests
  // carry no storageWrites today, so the started-quest count documents how
  // much of the 51-quest catalog is actually progressable in game.
  step("requesting the quest log (started quests only)");
  const beforeLog = client.mark();
  client.send({ type: "quest-log-get" });
  const questLog = await client.waitFor(
    (m): m is Extract<typeof m, { type: "quest-log" }> =>
      m.type === "quest-log",
    "quest-log",
    { since: beforeLog },
  );
  ok(`quest log lists ${questLog.quests.length} started quest(s) after the sweep`);

  step("sweep summary");
  console.log(
    `  chests: ${chests.length}, granted+emptied: ${looted}, shared-key empties: ${sharedEmpty}, findings: ${findings.length}`,
  );
  for (const finding of findings) {
    console.log(
      `  FINDING chest=${finding.uniqueId} pos=(${finding.position.x},${finding.position.y},${finding.position.z}) ${finding.category}: ${finding.detail}`,
    );
  }
  console.log(
    `SWEEP_REPORT_JSON ${JSON.stringify({
      total: chests.length,
      looted,
      sharedEmpty,
      startedQuests: questLog.quests.length,
      findings,
    })}`,
  );
  if (findings.length > 0) {
    console.error(`\nFAIL: ${findings.length} chest(s) deviated`);
  } else {
    console.log("\nPASS: every placed chest grants once and empties");
  }
  process.exitCode = findings.length > 0 ? 1 : 0;
} catch (error) {
  console.error("\nFAIL:", error);
  process.exitCode = 1;
} finally {
  client?.terminate();
  await server?.stop();
}
