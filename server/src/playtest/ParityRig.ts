import {
  type Direction,
  type CombatTarget,
  type EquipmentSlot,
  type InventoryState,
  type OwnProgressionState,
  type Position,
  type ServerMessage,
  type StarterVocation,
} from "@tibia/protocol";
import { PlaytestClient } from "./PlaytestClient";

export interface CastOutcome {
  readonly errorCode: string | null;
  readonly cooldownStarted: boolean;
  readonly combatTexts: Array<
    Extract<ServerMessage, { type: "combat-text" }>
  >;
  readonly effects: Array<Extract<ServerMessage, { type: "magic-effect" }>>;
  readonly missiles: Array<
    Extract<ServerMessage, { type: "distance-missile" }>
  >;
  readonly sinceMark: number;
}

const isType = <T extends ServerMessage["type"]>(type: T) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: T }> =>
    m.type === type;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One connected playtest character with combat-parity helpers on top of the
 * raw PlaytestClient: GM-driven stat setup, position/inventory/progression
 * tracking from the live message stream, spell casting with collected
 * feedback, and precise movement for placing this character inside spell
 * areas. Used by the spell/weapon/monster parity scenarios.
 */
export class ParityRig {
  readonly client: PlaytestClient;
  readonly name: string;

  private constructor(client: PlaytestClient, name: string) {
    this.client = client;
    this.name = name;
  }

  static async create(
    url: string,
    token: string,
    name: string,
    vocation: StarterVocation,
  ): Promise<ParityRig> {
    const client = await PlaytestClient.connect(url);
    await client.enter(token, name, vocation);
    return new ParityRig(client, name);
  }

  get playerId(): string {
    return this.client.playerId ?? "";
  }

  /** Latest known own position, tracked from welcome/moves/corrections. */
  get position(): Position {
    let position: Position | null = null;
    for (const message of this.client.messages) {
      if (message.type === "welcome") {
        position = message.character.position;
      } else if (
        message.type === "creature-moved" &&
        message.creatureId === this.playerId
      ) {
        position = message.position;
      } else if (
        message.type === "position-correction" &&
        message.playerId === this.playerId
      ) {
        position = message.position;
      }
    }
    if (!position) throw new Error(`${this.name}: own position unknown`);
    return position;
  }

  get positionRevision(): number {
    let revision = 0;
    for (const message of this.client.messages) {
      if (
        (message.type === "creature-moved" &&
          message.creatureId === this.playerId) ||
        (message.type === "position-correction" &&
          message.playerId === this.playerId)
      ) {
        revision = message.positionRevision;
      }
    }
    return revision;
  }

  /** Latest known position of any creature, or null when never seen. */
  creaturePosition(creatureId: string): Position | null {
    let position: Position | null = null;
    for (const message of this.client.messages) {
      if (message.type === "welcome") {
        const found = message.creatures.find((c) => c.id === creatureId);
        if (found) position = found.position;
      } else if (
        message.type === "creature-joined" &&
        message.creature.id === creatureId
      ) {
        position = message.creature.position;
      } else if (
        message.type === "creature-moved" &&
        message.creatureId === creatureId
      ) {
        position = message.position;
      } else if (
        message.type === "creature-state-changed" &&
        message.creature.id === creatureId
      ) {
        position = message.creature.position;
      }
    }
    return position;
  }

  creatureAlive(creatureId: string): boolean {
    for (let i = this.client.messages.length - 1; i >= 0; i--) {
      const message = this.client.messages[i];
      if (message?.type === "creature-left" && message.creatureId === creatureId) {
        return false;
      }
    }
    return true;
  }

  get progression(): OwnProgressionState {
    for (let i = this.client.messages.length - 1; i >= 0; i--) {
      const message = this.client.messages[i];
      if (message?.type === "progression-updated") return message.progression;
      if (message?.type === "welcome") return message.character;
    }
    throw new Error(`${this.name}: no progression state seen`);
  }

  get inventory(): InventoryState {
    for (let i = this.client.messages.length - 1; i >= 0; i--) {
      const message = this.client.messages[i];
      if (message?.type === "inventory-updated") return message.inventory;
      if (message?.type === "welcome") return message.inventory;
    }
    throw new Error(`${this.name}: no inventory state seen`);
  }

  /** Runs one GM slash command and returns the reply; throws when it fails. */
  async gm(command: string): Promise<string> {
    const since = this.client.mark();
    this.client.say(command);
    const reply = await this.client.waitFor(
      isType("gm-response"),
      `gm-response for ${command}`,
      { since },
    );
    if (!reply.ok) {
      throw new Error(`${this.name}: ${command} failed: ${reply.text}`);
    }
    return reply.text;
  }

  async setupStats(options: {
    level?: number;
    magicLevel?: number;
    skills?: Partial<Record<string, number>>;
  }): Promise<void> {
    if (options.level && this.progression.level < options.level) {
      await this.gm(`/level ${options.level}`);
    }
    if (
      options.magicLevel &&
      this.progression.magicLevel < options.magicLevel
    ) {
      await this.gm(`/magic ${options.magicLevel}`);
    }
    for (const [skill, level] of Object.entries(options.skills ?? {})) {
      const current = this.progression.skills.find(
        (entry) => entry.skill === skill,
      );
      if (level && (current?.level ?? 10) < level) {
        await this.gm(`/skill ${skill} ${level}`);
      }
    }
    await this.gm("/heal");
    await this.gm("/soul");
  }

  async heal(): Promise<void> {
    await this.gm("/heal");
  }

  async setHealth(target: number): Promise<void> {
    await this.gm(`/hp ${target}`);
  }

  /** Teleports near x,y,z (server picks the nearest free tile). */
  async goto(x: number, y: number, z: number): Promise<Position> {
    const text = await this.gm(`/goto ${x} ${y} ${z}`);
    const match = /Position: (\d+), (\d+), (\d+)/.exec(text);
    if (!match) throw new Error(`${this.name}: unparsable /goto reply ${text}`);
    return {
      x: Number(match[1]),
      y: Number(match[2]),
      z: Number(match[3]),
    };
  }

  /**
   * Creates items via /i and returns the updated inventory. Retries while a
   * previous item persist is still draining (the server answers those with a
   * combat-action-failed error instead of a gm-response).
   */
  async give(itemQuery: string, count?: number): Promise<InventoryState> {
    const command = count ? `/i ${itemQuery} ${count}` : `/i ${itemQuery}`;
    for (let attempt = 0; attempt < 8; attempt++) {
      const since = this.client.mark();
      this.client.say(command);
      const outcome = await Promise.race([
        this.client
          .waitFor(isType("gm-response"), `gm-response for ${command}`, {
            since,
          })
          .then((reply) => ({ kind: "gm" as const, reply })),
        this.client
          .waitFor(isType("error"), `error for ${command}`, { since })
          .then(() => ({ kind: "busy" as const })),
      ]);
      if (outcome.kind === "busy") {
        await sleep(400);
        continue;
      }
      if (!outcome.reply.ok) {
        throw new Error(`${this.name}: ${command} failed: ${outcome.reply.text}`);
      }
      await this.client.waitFor(
        isType("inventory-updated"),
        "inventory after /i",
        { since },
      );
      return this.inventory;
    }
    throw new Error(`${this.name}: ${command} kept failing while items persisted`);
  }

  findCarriedItem(
    typeId: number,
  ): { id: string; revision: number; count: number; twoHanded: boolean } | null {
    const inventory = this.inventory;
    const slots = [
      ...inventory.items,
      ...(inventory.containers ?? []).flatMap((container) => container.items),
    ];
    for (const entry of slots) {
      if (entry.item.typeId === typeId) {
        return {
          id: entry.item.id,
          revision: entry.item.revision,
          count: entry.item.count,
          twoHanded: entry.item.twoHanded ?? false,
        };
      }
    }
    return null;
  }

  /** Best-effort: drops every carried stack of the type at the rig's feet. */
  async dropCarried(typeId: number): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const carried = this.findCarriedItem(typeId);
      if (!carried) return;
      const since = this.client.mark();
      this.client.send({
        type: "drop-item",
        itemId: carried.id,
        revision: carried.revision,
        position: this.position,
        count: Math.min(carried.count, 100),
      });
      const outcome = await Promise.race([
        this.client
          .waitFor(isType("inventory-updated"), "drop result", {
            since,
            timeoutMs: 3_000,
          })
          .then(() => "dropped" as const),
        this.client
          .waitFor(isType("error"), "drop error", { since, timeoutMs: 3_000 })
          .then(() => "busy" as const),
      ]).catch(() => "busy" as const);
      if (outcome === "busy") await sleep(400);
    }
  }

  /** Total count of a type across stacks, open containers, and equipment. */
  countCarried(typeId: number): number {
    const inventory = this.inventory;
    const items = [
      ...inventory.items.map((entry) => entry.item),
      ...(inventory.containers ?? []).flatMap((container) =>
        container.items.map((entry) => entry.item),
      ),
      ...Object.values(inventory.equipment).filter(
        (item): item is NonNullable<typeof item> => item !== undefined,
      ),
    ];
    return items
      .filter((item) => item.typeId === typeId)
      .reduce((total, item) => total + item.count, 0);
  }

  equippedItem(
    slot: EquipmentSlot,
  ): { id: string; typeId: number; count: number; revision: number } | null {
    const item = this.inventory.equipment[slot];
    return item
      ? {
          id: item.id,
          typeId: item.typeId,
          count: item.count,
          revision: item.revision,
        }
      : null;
  }

  /** Gives an item by type id and equips it into the given slot. */
  async giveAndEquip(
    typeId: number,
    slot: EquipmentSlot,
    count?: number,
  ): Promise<void> {
    await this.unequipSlotIfDifferent(slot, typeId);
    await this.give(String(typeId), count);
    const carried = this.findCarriedItem(typeId);
    if (!carried) {
      throw new Error(`${this.name}: item ${typeId} not in inventory after /i`);
    }
    if (slot === "weapon" && carried.twoHanded) {
      await this.unequipSlotIfDifferent("shield", 0);
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      const current = this.findCarriedItem(typeId);
      if (!current) {
        throw new Error(`${this.name}: item ${typeId} disappeared before equip`);
      }
      const since = this.client.mark();
      this.client.send({
        type: "equip-item",
        itemId: current.id,
        revision: current.revision,
        slot,
      });
      const outcome = await Promise.race([
        this.client
          .waitFor(
            (m): m is Extract<ServerMessage, { type: "inventory-updated" }> =>
              m.type === "inventory-updated" &&
              m.inventory.equipment[slot]?.typeId === typeId,
            `equip ${typeId} into ${slot}`,
            { since },
          )
          .then(() => "equipped" as const),
        this.client
          .waitFor(isType("error"), "equip error", { since })
          .then(() => "busy" as const),
      ]);
      if (outcome === "equipped") return;
      await sleep(400);
    }
    throw new Error(`${this.name}: equip ${typeId} kept failing`);
  }

  private async unequipSlotIfDifferent(
    slot: EquipmentSlot,
    keepTypeId: number,
  ): Promise<void> {
    const occupied = this.equippedItem(slot);
    if (!occupied || occupied.typeId === keepTypeId) return;
    const since = this.client.mark();
    this.client.send({
      type: "unequip-item",
      itemId: occupied.id,
      revision: occupied.revision,
      slot,
    });
    await this.client.waitFor(
      (m): m is Extract<ServerMessage, { type: "inventory-updated" }> =>
        m.type === "inventory-updated" &&
        m.inventory.equipment[slot] === undefined,
      `unequip ${slot}`,
      { since },
    );
  }

  async spawnMonster(
    typeId: string,
    displayName: string,
  ): Promise<{ id: string; position: Position }> {
    const since = this.client.mark();
    await this.gm(`/spawn ${typeId}`);
    return this.client.waitForCreatureNamed(displayName, { since });
  }

  async attackTarget(creatureId: string): Promise<void> {
    const since = this.client.mark();
    this.client.send({ type: "attack-target", creatureId });
    const changed = await Promise.race([
      this.client.waitFor(
        (m): m is Extract<ServerMessage, { type: "attack-target-changed" }> =>
          m.type === "attack-target-changed" && m.creatureId === creatureId,
        "attack-target-changed",
        { since },
      ),
      this.client
        .waitFor(isType("error"), "attack-target error", { since })
        .then(() => null),
    ]);
    if (!changed) {
      throw new Error(`${this.name}: could not target ${creatureId}`);
    }
  }

  async cancelAttack(): Promise<void> {
    const since = this.client.mark();
    this.client.send({ type: "cancel-attack" });
    await this.client
      .waitFor(
        (m): m is Extract<ServerMessage, { type: "attack-target-changed" }> =>
          m.type === "attack-target-changed" && m.creatureId === null,
        "attack cancel",
        { since, timeoutMs: 3_000 },
      )
      .catch(() => undefined);
  }

  /**
   * Sends one movement intent and resolves once the server confirms the step
   * or replies with a correction (a blocked step still turns the character).
   */
  async step(direction: Direction): Promise<void> {
    const since = this.client.mark();
    this.client.send({ type: "move", direction, queueStep: true });
    this.client.send({ type: "stop-move" });
    await Promise.race([
      this.client.waitFor(
        (m): m is Extract<ServerMessage, { type: "creature-moved" }> =>
          m.type === "creature-moved" && m.creatureId === this.playerId,
        "own step",
        { since, timeoutMs: 3_000 },
      ),
      this.client.waitFor(
        (m): m is Extract<ServerMessage, { type: "position-correction" }> =>
          m.type === "position-correction" && m.playerId === this.playerId,
        "step correction",
        { since, timeoutMs: 3_000 },
      ),
    ]).catch(() => undefined);
    await sleep(50);
  }

  /**
   * Walks one tile at a time toward the target until reached or no progress
   * is possible. Returns true when standing exactly on the target tile.
   */
  async walkTo(target: Position, maxSteps = 30): Promise<boolean> {
    for (let i = 0; i < maxSteps; i++) {
      const current = this.position;
      if (current.x === target.x && current.y === target.y) return true;
      const dx = Math.sign(target.x - current.x);
      const dy = Math.sign(target.y - current.y);
      const direction = this.directionFor(dx, dy);
      if (!direction) return false;
      await this.step(direction);
      const after = this.position;
      if (after.x === current.x && after.y === current.y) {
        // Blocked diagonal progress: try the two cardinal fallbacks.
        const fallbacks: Array<Direction | null> = [
          dx !== 0 ? this.directionFor(dx, 0) : null,
          dy !== 0 ? this.directionFor(0, dy) : null,
        ];
        let progressed = false;
        for (const fallback of fallbacks) {
          if (!fallback) continue;
          await this.step(fallback);
          const retry = this.position;
          if (retry.x !== current.x || retry.y !== current.y) {
            progressed = true;
            break;
          }
        }
        if (!progressed) return false;
      }
      await sleep(120);
    }
    return (
      this.position.x === target.x &&
      this.position.y === target.y
    );
  }

  /**
   * Casts a spell and gathers the resulting feedback: an error code, or the
   * cooldown activation plus all combat texts/effects/missiles that arrived
   * with it.
   */
  async cast(
    spellId: string,
    target: CombatTarget,
    settleMs = 350,
    cooldownGroups?: ReadonlyArray<string>,
  ): Promise<CastOutcome> {
    const since = this.client.mark();
    this.client.send({ type: "cast-spell", spellId, target });
    return this.collectCastOutcome(
      since,
      cooldownGroups ?? [`spell:${spellId}`],
      settleMs,
    );
  }

  /** Uses a carried rune (by item type id) on the given target. */
  async useRune(
    runeTypeId: number,
    target: CombatTarget,
    settleMs = 350,
  ): Promise<CastOutcome> {
    const carried = this.findCarriedItem(runeTypeId);
    if (!carried) {
      throw new Error(`${this.name}: rune ${runeTypeId} not carried`);
    }
    const since = this.client.mark();
    this.client.send({
      type: "use-rune",
      itemId: carried.id,
      revision: carried.revision,
      target,
    });
    return this.collectCastOutcome(since, null, settleMs);
  }

  private async collectCastOutcome(
    since: number,
    cooldownGroups: ReadonlyArray<string> | null,
    settleMs: number,
  ): Promise<CastOutcome> {
    const startedAt = Date.now();
    const matchesCooldown = (m: ServerMessage): boolean =>
      m.type === "fight-state" &&
      (cooldownGroups === null ||
        m.fightState.cooldowns.some(
          (cooldown) =>
            cooldownGroups.includes(cooldown.group) &&
            cooldown.readyAt > startedAt,
        ));
    const outcome = await Promise.race([
      this.client
        .waitFor(isType("error"), "cast error", { since, timeoutMs: 5_000 })
        .then((m) => ({ kind: "error" as const, code: m.code })),
      this.client
        .waitFor(
          (m): m is Extract<ServerMessage, { type: "fight-state" }> =>
            matchesCooldown(m),
          "fight-state after cast",
          { since, timeoutMs: 5_000 },
        )
        .then(() => ({ kind: "ok" as const, code: null })),
    ]).catch(() => ({ kind: "timeout" as const, code: null }));
    await sleep(settleMs);
    const messages = this.client.messages.slice(since);
    return {
      errorCode:
        outcome.kind === "error"
          ? outcome.code
          : (messages.find(isType("error"))?.code ?? null),
      cooldownStarted: messages.some(matchesCooldown),
      combatTexts: messages.filter(isType("combat-text")),
      effects: messages.filter(isType("magic-effect")),
      missiles: messages.filter(isType("distance-missile")),
      sinceMark: since,
    };
  }

  /** Waits until no cooldown in the given groups is still running. */
  async waitForCooldowns(groups: ReadonlyArray<string>): Promise<void> {
    for (;;) {
      let latest: Extract<ServerMessage, { type: "fight-state" }> | null = null;
      for (let i = this.client.messages.length - 1; i >= 0; i--) {
        const message = this.client.messages[i];
        if (message?.type === "fight-state") {
          latest = message;
          break;
        }
      }
      // 150 ms slack: the server tick's clock can trail wall time slightly,
      // and a cast landing exactly on readyAt still reads as exhausted.
      const now = Date.now() - 150;
      const active = latest?.fightState.cooldowns.filter(
        (cooldown) =>
          cooldown.readyAt > now &&
          groups.some(
            (group) =>
              cooldown.group === group || cooldown.group.startsWith(group),
          ),
      );
      if (!active || active.length === 0) return;
      const soonest = Math.min(...active.map((cooldown) => cooldown.readyAt));
      await sleep(Math.min(Math.max(soonest - now, 50), 2_000));
    }
  }

  messagesSince(mark: number): ServerMessage[] {
    return this.client.messages.slice(mark);
  }

  mark(): number {
    return this.client.mark();
  }

  private directionFor(dx: number, dy: number): Direction | null {
    if (dx === 0 && dy === -1) return "north";
    if (dx === 1 && dy === -1) return "northeast";
    if (dx === 1 && dy === 0) return "east";
    if (dx === 1 && dy === 1) return "southeast";
    if (dx === 0 && dy === 1) return "south";
    if (dx === -1 && dy === 1) return "southwest";
    if (dx === -1 && dy === 0) return "west";
    if (dx === -1 && dy === -1) return "northwest";
    return null;
  }
}
