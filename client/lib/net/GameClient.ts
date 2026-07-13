import {
  serverMessageSchema,
  type ClientMessage,
  type Direction,
  type ServerMessage,
} from "@tibia/protocol";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface GameClientHandlers {
  onMessage(message: ServerMessage): void;
  onStatus(status: ConnectionStatus): void;
}

export class GameClient {
  private socket: WebSocket | null = null;

  constructor(
    private readonly url: string,
    private readonly handlers: GameClientHandlers,
  ) {}

  connect(name: string): void {
    this.handlers.onStatus("connecting");
    const socket = new WebSocket(this.url);
    socket.onopen = () => {
      this.handlers.onStatus("connected");
      this.send({ type: "join", name });
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
    this.handlers.onMessage(result.data);
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }
}
