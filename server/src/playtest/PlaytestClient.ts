import WebSocket from "ws";
import {
  parseServerMessages,
  type ClientMessage,
  type ServerMessage,
  type StarterVocation,
} from "@tibia/protocol";

/**
 * Headless game client for playtest scenarios: speaks the real wire protocol
 * against a locally running dev server (DEV_AUTH=1). Every inbound message is
 * validated against the protocol schema, so a scenario run doubles as a check
 * that the server only emits schema-conformant messages.
 */
export class PlaytestClient {
  readonly messages: ServerMessage[] = [];
  /** Wall-clock arrival time of messages[i], for latency/interval checks. */
  readonly receivedAt: number[] = [];
  playerId: string | null = null;
  private readonly socket: WebSocket;
  private closedReason: string | null = null;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on("message", (data) => {
      const parsed = parseServerMessages(JSON.parse(data.toString()));
      if (!parsed) {
        throw new Error(
          `server sent a message that fails the protocol schema: ${data.toString().slice(0, 300)}`,
        );
      }
      for (const message of parsed) {
        this.messages.push(message);
        this.receivedAt.push(Date.now());
      }
    });
    socket.on("close", () => {
      this.closedReason ??= "closed by server";
    });
  }

  static connect(url: string): Promise<PlaytestClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.on("error", reject);
      socket.on("open", () => resolve(new PlaytestClient(socket)));
    });
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  say(text: string): void {
    this.send({ type: "speak", mode: "say", text });
  }

  /** Index into the message log; pass to waitFor to only match newer messages. */
  mark(): number {
    return this.messages.length;
  }

  async waitFor<T extends ServerMessage>(
    predicate: (message: ServerMessage) => message is T,
    label: string,
    options: { timeoutMs?: number; since?: number } = {},
  ): Promise<T> {
    const { timeoutMs = 10_000, since = 0 } = options;
    const deadline = Date.now() + timeoutMs;
    let cursor = since;
    for (;;) {
      for (; cursor < this.messages.length; cursor++) {
        const message = this.messages[cursor];
        if (message && predicate(message)) return message;
      }
      if (this.closedReason) {
        throw new Error(`waiting for ${label}: connection ${this.closedReason}`);
      }
      if (Date.now() > deadline) {
        const seen = [...new Set(this.messages.slice(since).map((m) => m.type))];
        throw new Error(
          `timed out waiting for ${label}; saw message types: ${seen.join(", ") || "none"}`,
        );
      }
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 5));
    }
  }

  /**
   * Full login flow: authenticate with a dev token, then select (creating on
   * first run) the named character and wait for world entry.
   */
  async enter(
    token: string,
    characterName: string,
    vocation: StarterVocation = "Knight",
  ): Promise<void> {
    this.send({ type: "auth", token, language: "en" });
    await this.waitFor(
      (m): m is ServerMessage & { type: "auth-ok" } => m.type === "auth-ok",
      "auth-ok",
    );
    this.send({ type: "list-characters" });
    const list = await this.waitFor(
      (m): m is ServerMessage & { type: "character-list" } =>
        m.type === "character-list",
      "character-list",
    );
    let character = list.characters.find(
      (candidate) => candidate.name === characterName,
    );
    if (!character) {
      const since = this.mark();
      this.send({
        type: "create-character",
        name: characterName,
        vocation,
        lookType: 128,
      });
      const updated = await this.waitFor(
        (m): m is ServerMessage & { type: "character-list" } =>
          m.type === "character-list",
        "character-list after create",
        { since },
      );
      character = updated.characters.find(
        (candidate) => candidate.name === characterName,
      );
    }
    if (!character) {
      throw new Error(`character ${characterName} was not created`);
    }
    this.send({ type: "select-character", characterId: character.id });
    const welcome = await this.waitFor(
      (m): m is ServerMessage & { type: "welcome" } => m.type === "welcome",
      "welcome",
    );
    this.playerId = welcome.playerId;
  }

  /** Waits until a creature with this name is visible (welcome or joined). */
  async waitForCreatureNamed(
    name: string,
    options: { timeoutMs?: number; since?: number } = {},
  ): Promise<{ id: string; position: { x: number; y: number; z: number } }> {
    const message = await this.waitFor(
      (m): m is ServerMessage & { type: "welcome" | "creature-joined" } =>
        (m.type === "welcome" &&
          m.creatures.some((creature) => creature.name === name)) ||
        (m.type === "creature-joined" && m.creature.name === name),
      `creature named ${name}`,
      options,
    );
    const creature =
      message.type === "welcome"
        ? message.creatures.find((candidate) => candidate.name === name)
        : message.creature;
    if (!creature) throw new Error(`creature ${name} vanished from message`);
    return { id: creature.id, position: creature.position };
  }

  /** Hard-closes the socket, like a client crash or abrupt logout. */
  terminate(): void {
    this.closedReason ??= "terminated by scenario";
    this.socket.terminate();
  }
}
