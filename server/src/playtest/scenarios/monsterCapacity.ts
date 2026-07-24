import type {
  CreatureState,
  Direction,
  InventoryItem,
  InventoryState,
  Position,
  ServerMessage,
} from "@tibia/protocol";
import { PlaytestClient } from "../PlaytestClient";

const url = process.env.LOAD_TEST_URL ?? "ws://127.0.0.1:4125";
const stages = [100, 300, 500, 1_000, 1_500, 1_900] as const;
const runeTypeId = 3_191;

class MonsterView {
  private readonly creatures = new Map<string, CreatureState>();
  private cursor = 0;
  private ownPosition: Position | null = null;
  inventory: InventoryState | null = null;
  deaths = 0;
  healthUpdates = 0;
  magicEffects = 0;
  combatTexts = 0;
  readonly errors: string[] = [];

  constructor(private readonly client: PlaytestClient) {}

  sync(): void {
    for (; this.cursor < this.client.messages.length; this.cursor++) {
      const message = this.client.messages[this.cursor];
      if (message) this.receive(message);
    }
  }

  monsterCount(): number {
    this.sync();
    return [...this.creatures.values()].filter(
      (creature) =>
        creature.kind === "monster" &&
        creature.id.startsWith("monster-gm:butterfly:"),
    ).length;
  }

  closestMonster(): CreatureState | null {
    this.sync();
    if (!this.ownPosition) return null;
    let closest: CreatureState | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const creature of this.creatures.values()) {
      if (
        creature.kind !== "monster" ||
        !creature.id.startsWith("monster-gm:butterfly:")
      ) {
        continue;
      }
      const candidateDistance = Math.max(
        Math.abs(creature.position.x - this.ownPosition.x),
        Math.abs(creature.position.y - this.ownPosition.y),
      );
      if (
        creature.position.z === this.ownPosition.z &&
        candidateDistance < distance
      ) {
        closest = creature;
        distance = candidateDistance;
      }
    }
    return closest;
  }

  findItem(typeId: number): InventoryItem | null {
    this.sync();
    if (!this.inventory) return null;
    for (const entry of this.inventory.items) {
      if (entry.item.typeId === typeId) return entry.item;
    }
    for (const container of this.inventory.containers ?? []) {
      for (const entry of container.items) {
        if (entry.item.typeId === typeId) return entry.item;
      }
    }
    return null;
  }

  private receive(message: ServerMessage): void {
    if (message.type === "welcome") {
      this.inventory = message.inventory;
      this.ownPosition = { ...message.character.position };
      for (const creature of message.creatures) {
        this.creatures.set(creature.id, creature);
      }
      return;
    }
    if (message.type === "creature-joined") {
      this.creatures.set(message.creature.id, message.creature);
      return;
    }
    if (message.type === "creature-state-changed") {
      this.creatures.set(message.creature.id, message.creature);
      return;
    }
    if (message.type === "creature-moved") {
      if (message.creatureId === this.client.playerId) {
        this.ownPosition = { ...message.position };
      }
      const creature = this.creatures.get(message.creatureId);
      if (!creature) return;
      this.creatures.set(message.creatureId, {
        ...creature,
        position: message.position,
        positionRevision: message.positionRevision,
        direction: message.direction,
      });
      return;
    }
    if (message.type === "creature-left") {
      if (
        this.creatures
          .get(message.creatureId)
          ?.id.startsWith("monster-gm:butterfly:")
      ) {
        this.deaths++;
      }
      this.creatures.delete(message.creatureId);
      return;
    }
    if (message.type === "inventory-updated") {
      this.inventory = message.inventory;
      return;
    }
    if (
      message.type === "creature-health" &&
      this.creatures
        .get(message.creatureId)
        ?.id.startsWith("monster-gm:butterfly:")
    ) {
      this.healthUpdates++;
      return;
    }
    if (message.type === "magic-effect") {
      this.magicEffects++;
      return;
    }
    if (message.type === "combat-text") this.combatTexts++;
    if (message.type === "error") this.errors.push(message.code);
  }
}

async function runGmCommand(
  client: PlaytestClient,
  command: string,
): Promise<string> {
  const since = client.mark();
  client.say(command);
  const response = await client.waitFor(
    (message): message is ServerMessage & { type: "gm-response" } =>
      message.type === "gm-response",
    `GM response for ${command}`,
    { since, timeoutMs: 60_000 },
  );
  if (!response.ok) throw new Error(`${command}: ${response.text}`);
  return response.text;
}

async function waitUntil(
  predicate: () => boolean,
  label: string,
  timeoutMs = 60_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() > deadline) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function probeTurns(
  client: PlaytestClient,
  rounds: number,
): Promise<{ p50Ms: number; p95Ms: number; p99Ms: number; worstMs: number }> {
  const directions: Direction[] = ["north", "east", "south", "west"];
  const latencies: number[] = [];
  for (let round = 0; round < rounds; round++) {
    const since = client.mark();
    const startedAt = performance.now();
    client.send({
      type: "turn",
      direction: directions[round % directions.length]!,
    });
    await client.waitFor(
      (message): message is ServerMessage & { type: "creature-moved" } =>
        message.type === "creature-moved" &&
        message.creatureId === client.playerId,
      "turn acknowledgement",
      { since, timeoutMs: 10_000 },
    );
    const latency = performance.now() - startedAt;
    latencies.push(latency);
    const pacingMs = 40 - latency;
    if (pacingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pacingMs));
    }
  }
  latencies.sort((left, right) => left - right);
  const percentile = (fraction: number): number =>
    latencies[Math.floor((latencies.length - 1) * fraction)] ?? 0;
  return {
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    worstMs: latencies.at(-1) ?? 0,
  };
}

const client = await PlaytestClient.connect(url);
const view = new MonsterView(client);
let failed = false;

try {
  await client.enter("monster-load", "Monster Probe", "Sorcerer");
  await runGmCommand(client, "/despawn");
  await runGmCommand(client, "/goto 32369 32260 7");
  await runGmCommand(client, "/heal");

  let current = 0;
  for (const target of stages) {
    const text = await runGmCommand(
      client,
      `/spawn butterfly ${target - current}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const latency = await probeTurns(client, 100);
    console.log(
      `MONSTER_STAGE count=${target} visible=${view.monsterCount()} ` +
        `response="${text}" ` +
        `p50=${latency.p50Ms.toFixed(1)}ms ` +
        `p95=${latency.p95Ms.toFixed(1)}ms ` +
        `p99=${latency.p99Ms.toFixed(1)}ms ` +
        `worst=${latency.worstMs.toFixed(1)}ms`,
    );
    current = target;
  }

  await waitUntil(() => view.findItem(runeTypeId) !== null, "fireball rune");
  const effectsBefore = view.magicEffects;
  const healthBefore = view.healthUpdates;
  const deathsBefore = view.deaths;

  client.send({ type: "turn", direction: "south" });
  client.send({
    type: "cast-spell",
    spellId: "exevo-gran-flam-hur",
    target: { kind: "direction" },
  });
  await waitUntil(
    () => {
      view.sync();
      return view.deaths > deathsBefore || view.errors.length > 0;
    },
    "spell outcome",
    15_000,
  );
  if (view.deaths === deathsBefore) {
    throw new Error(`spell failed: ${view.errors.join(", ") || "no error"}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 2_100));
  const rune = view.findItem(runeTypeId);
  const runeTarget = view.closestMonster();
  if (!rune || !runeTarget) throw new Error("rune combat fixture is missing");
  client.send({
    type: "use-rune",
    itemId: rune.id,
    revision: rune.revision,
    target: { kind: "position", position: runeTarget.position },
  });
  const deathsAfterSpell = view.deaths;
  await waitUntil(
    () => {
      view.sync();
      return view.deaths > deathsAfterSpell;
    },
    "rune deaths",
    15_000,
  );

  await new Promise((resolve) => setTimeout(resolve, 2_100));
  const attackTarget = view.closestMonster();
  if (!attackTarget) throw new Error("auto-attack fixture is missing");
  const attackMark = client.mark();
  client.send({ type: "attack-target", creatureId: attackTarget.id });
  await client.waitFor(
    (
      message,
    ): message is ServerMessage & { type: "attack-target-changed" } =>
      message.type === "attack-target-changed" &&
      message.creatureId === attackTarget.id,
    "auto-attack target acknowledgement",
    { since: attackMark, timeoutMs: 10_000 },
  );
  await new Promise((resolve) => setTimeout(resolve, 5_000));

  const combatLatency = await probeTurns(client, 100);
  view.sync();
  console.log(
    `MONSTER_COMBAT remaining=${view.monsterCount()} ` +
      `deaths=${view.deaths - deathsBefore} ` +
      `healthUpdates=${view.healthUpdates - healthBefore} ` +
      `effects=${view.magicEffects - effectsBefore} ` +
      `combatTexts=${view.combatTexts} ` +
      `p95=${combatLatency.p95Ms.toFixed(1)}ms ` +
      `p99=${combatLatency.p99Ms.toFixed(1)}ms`,
  );
} catch (cause) {
  failed = true;
  console.error(cause);
} finally {
  await runGmCommand(client, "/despawn").catch(() => undefined);
  client.terminate();
}

process.exit(failed ? 1 : 0);
