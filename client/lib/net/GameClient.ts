import {
  serverMessageSchema,
  type CreateCharacterInput,
  type ClientMessage,
  type Direction,
  type Language,
  type Position,
  type ServerErrorCode,
  type ServerMessage,
  type ViewRange,
} from "@tibia/protocol";

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
