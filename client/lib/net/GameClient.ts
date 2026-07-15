import {
  serverMessageSchema,
  type ClientMessage,
  type Direction,
  type Language,
  type ServerErrorCode,
  type ServerMessage,
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
  private joinName = "";

  constructor(
    private readonly url: string,
    private readonly handlers: GameClientHandlers,
  ) {}

  /** Opens the socket, authenticates, then joins once the server says auth-ok. */
  connect(accessToken: string, name: string, language: Language): void {
    this.joinName = name;
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

  sendMove(direction: Direction): void {
    this.send({ type: "move", direction });
  }

  stopMoving(): void {
    this.send({ type: "stop-move" });
  }

  updateLanguage(language: Language): boolean {
    return this.send({ type: "set-language", language });
  }

  disconnect(): void {
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
      this.handlers.onLanguage(result.data.language);
      this.send({ type: "join", name: this.joinName });
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
