import {
  serverMessageSchema,
  type ChatSpeechMode,
  type CreateCharacterInput,
  type ClientMessage,
  type CombatTarget,
  type Direction,
  type FightMode,
  type InventoryItem,
  type Language,
  type Position,
  type ServerErrorCode,
  type ServerMessage,
  type ViewRange,
} from "@tibia/protocol";
import type { PendingItemOpIntent } from "../inventory/PendingItemOp";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface GameClientHandlers {
  onMessage(message: ServerMessage): void;
  onStatus(status: ConnectionStatus): void;
  onLanguage(language: Language): void;
  onError(code: ServerErrorCode): void;
}

export class GameClient {
  private socket: WebSocket | null = null;
  private authenticated = false;
  private viewRange: ViewRange | null = null;
  private ownPlayerId: string | null = null;
  private positionRevision = 0;

  constructor(
    private readonly url: string,
    private readonly handlers: GameClientHandlers,
  ) {}

  /** Opens the socket and authenticates; world entry requires a character id. */
  connect(accessToken: string, language: Language): void {
    this.handlers.onStatus("connecting");
    const socket = new WebSocket(this.url);
    socket.onopen = () => {
      this.handlers.onStatus("connected");
      this.send({ type: "auth", token: accessToken, language });
    };
    socket.onmessage = (event) => this.onMessage(event.data);
    socket.onclose = () => this.handlers.onStatus("disconnected");
    this.socket = socket;
  }

  sendMove(direction: Direction, queueStep = true): void {
    this.send({ type: "move", direction, queueStep });
  }

  stopMoving(): void {
    this.send({ type: "stop-move" });
  }

  autoWalk(directions: ReadonlyArray<Direction>): boolean {
    if (directions.length === 0) return false;
    return this.send({
      type: "auto-walk",
      positionRevision: this.positionRevision,
      directions: [...directions],
    });
  }

  setViewport(range: ViewRange): void {
    if (
      this.viewRange &&
      range.x === this.viewRange.x &&
      range.y === this.viewRange.y
    ) {
      return;
    }
    this.viewRange = { ...range };
    if (this.authenticated) {
      this.send({ type: "set-viewport", range: this.viewRange });
    }
  }

  useMap(position: Position): void {
    this.send({ type: "use-map", position });
  }

  attackTarget(creatureId: string): void {
    this.send({ type: "attack-target", creatureId });
  }

  cancelAttack(): void {
    this.send({ type: "cancel-attack" });
  }

  setFightMode(mode: FightMode): boolean {
    return this.send({ type: "set-fight-mode", mode });
  }

  castSpell(spellId: string, target: CombatTarget): boolean {
    return this.send({ type: "cast-spell", spellId, target });
  }

  useRune(item: InventoryItem, target: CombatTarget): boolean {
    return this.send({
      type: "use-rune",
      itemId: item.id,
      revision: item.revision,
      target,
    });
  }

  /** Sends a pre-built item drag intent (see useOptimisticInventory). */
  sendItemIntent(intent: PendingItemOpIntent): boolean {
    return this.send(intent);
  }

  openContainer(item: InventoryItem): boolean {
    return this.send({
      type: "open-container",
      itemId: item.id,
      revision: item.revision,
    });
  }

  closeContainer(containerId: string): boolean {
    return this.send({ type: "close-container", containerId });
  }

  useItem(item: InventoryItem): boolean {
    return this.send({
      type: "use-item",
      itemId: item.id,
      revision: item.revision,
    });
  }

  writeItem(itemId: string, revision: number, text: string): boolean {
    return this.send({
      type: "write-item",
      itemId,
      revision,
      text,
    });
  }

  speak(mode: ChatSpeechMode, text: string): boolean {
    return this.send({ type: "speak", mode, text });
  }

  sendPrivateChat(to: string, text: string): boolean {
    return this.send({ type: "private-chat", to, text });
  }

  sendNpcDialogueChoice(
    npcId: string,
    conversationId: string,
    choiceId: string,
  ): boolean {
    return this.send({
      type: "npc-dialogue-choice",
      npcId,
      conversationId,
      choiceId,
    });
  }

  createCharacter(input: CreateCharacterInput): boolean {
    return this.send({ type: "create-character", ...input });
  }

  selectCharacter(characterId: string): boolean {
    return this.send({ type: "select-character", characterId });
  }

  updateLanguage(language: Language): boolean {
    return this.send({ type: "set-language", language });
  }

  disconnect(): void {
    this.authenticated = false;
    this.ownPlayerId = null;
    this.positionRevision = 0;
    this.socket?.close();
    this.socket = null;
  }

  private onMessage(data: unknown): void {
    if (typeof data !== "string") return;
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const result = serverMessageSchema.safeParse(json);
    if (!result.success) return;
    if (result.data.type === "auth-ok") {
      this.authenticated = true;
      this.handlers.onLanguage(result.data.language);
      if (this.viewRange) {
        this.send({ type: "set-viewport", range: this.viewRange });
      }
      this.send({ type: "list-characters" });
      return;
    }
    if (result.data.type === "language-updated") {
      this.handlers.onLanguage(result.data.language);
      return;
    }
    if (result.data.type === "welcome") {
      const playerId = result.data.playerId;
      this.ownPlayerId = playerId;
      const own = result.data.creatures.find(
        (creature) => creature.id === playerId,
      );
      this.positionRevision = own?.positionRevision ?? 0;
    }
    if (
      result.data.type === "creature-moved" &&
      result.data.creatureId === this.ownPlayerId
    ) {
      this.positionRevision = result.data.positionRevision;
    }
    if (
      result.data.type === "position-correction" &&
      result.data.playerId === this.ownPlayerId
    ) {
      this.positionRevision = result.data.positionRevision;
    }
    if (result.data.type === "error") {
      this.handlers.onError(result.data.code);
      return;
    }
    this.handlers.onMessage(result.data);
  }

  private send(message: ClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }
}
