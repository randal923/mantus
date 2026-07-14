import { randomUUID } from "node:crypto";
import type { JoinMessage } from "@tibia/protocol";
import { Player } from "./Player";
import type { Session } from "./Session";
import type { SessionRegistry } from "./SessionRegistry";
import type { Visibility } from "./Visibility";
import type { World } from "./World";

export class JoinHandler {
  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly visibility: Visibility,
  ) {}

  handle(session: Session, intent: JoinMessage): void {
    if (session.playerId) {
      session.sendError("already-joined");
      return;
    }
    const spawn = this.world.findSpawn();
    if (!spawn) {
      session.sendError("world-full");
      session.terminate();
      return;
    }
    const player = new Player(
      randomUUID(),
      intent.name.trim(),
      spawn.x,
      spawn.y,
      "south",
    );
    this.world.addPlayer(player);
    session.playerId = player.id;
    this.registry.bindPlayer(session);
    const players = this.visibility.announceSpawn(session, player);
    session.send({
      type: "welcome",
      playerId: player.id,
      map: this.world.toMapState(),
      players,
    });
  }
}
