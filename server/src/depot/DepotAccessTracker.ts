import type { Position } from "@tibia/protocol";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Session } from "../Session";
import type { World } from "../World";
import { failDepot } from "./failDepot";
import { failMail } from "./failMail";
import { isNear } from "./isNear";
import type { StorageAccess } from "./StorageAccess";

export class DepotAccessTracker {
  private readonly accessBySession = new Map<string, StorageAccess>();

  constructor(
    private readonly world: World,
    private readonly items: ItemIntentHandler,
  ) {}

  open(session: Session, access: StorageAccess): void {
    this.accessBySession.set(session.id, access);
  }

  get(session: Session): StorageAccess | undefined {
    return this.accessBySession.get(session.id);
  }

  close(session: Session, sessionId: string): void {
    const access = this.accessBySession.get(session.id);
    if (access?.sessionId === sessionId) {
      this.accessBySession.delete(session.id);
    }
  }

  detach(session: Session): void {
    this.accessBySession.delete(session.id);
  }

  requireDepotAccess(
    session: Session,
    sessionId: string,
  ): Extract<StorageAccess, { kind: "depot" }> | null {
    const access = this.accessBySession.get(session.id);
    if (
      !access ||
      access.kind !== "depot" ||
      access.sessionId !== sessionId ||
      !this.isAccessCurrent(session, access)
    ) {
      this.closeOutOfRange(session, "depot");
      return null;
    }
    return access;
  }

  isAccessCurrent(session: Session, access: StorageAccess): boolean {
    const current = this.accessBySession.get(session.id);
    if (
      !session.playerId ||
      current?.sessionId !== access.sessionId ||
      !this.canReach(session, access.position)
    ) {
      return false;
    }
    const items = this.world.getMapItems(access.position);
    if (access.kind === "mailbox") {
      return items.some(
        (item) => this.items.itemType(item.itemId)?.kind === "mailbox",
      );
    }
    return items.some(
      (item) => Number(item.source?.attributes.depotId) === access.depotId,
    );
  }

  canReach(session: Session, position: Position): boolean {
    const player = session.playerId
      ? this.world.getPlayer(session.playerId)
      : undefined;
    return Boolean(
      player &&
        isNear(player.position, position) &&
        this.world.canSee(player.position, position, session.viewRange) &&
        this.world.hasLineOfSight(player.position, position),
    );
  }

  closeOutOfRange(session: Session, kind: "depot" | "mailbox"): void {
    this.accessBySession.delete(session.id);
    if (kind === "depot") {
      failDepot(session, "out-of-range");
      return;
    }
    failMail(session, "out-of-range");
  }
}
