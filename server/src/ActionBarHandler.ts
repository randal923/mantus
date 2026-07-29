import {
  createDefaultActionBar,
  type ActionBar,
  type CharacterVocation,
  type UpdateActionBarMessage,
} from "@tibia/protocol";
import type { CharacterStore } from "./character/CharacterStore";
import type { SpellRegistry } from "./combat/SpellRegistry";
import type { ItemIntentHandler } from "./item/ItemIntentHandler";
import { sanitizeActionBarAction } from "./sanitizeActionBarAction";
import type { Session } from "./Session";
import type { SessionRegistry } from "./SessionRegistry";
import type { World } from "./World";

export class ActionBarHandler {
  private readonly outcomes: Array<() => void> = [];

  constructor(
    private readonly registry: SessionRegistry,
    private readonly world: World,
    private readonly spells: SpellRegistry,
    private readonly items: ItemIntentHandler,
    private readonly characters: CharacterStore,
  ) {}

  handle(
    session: Session,
    intent: UpdateActionBarMessage,
  ): void {
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    if (!playerId || !player) {
      session.sendError("join-required");
      return;
    }
    if (session.actionBarUpdatePending) {
      session.sendError("action-bar-update-pending");
      return;
    }

    const sanitized = this.sanitizeActionBar(intent.actionBar, player.vocation);
    if (!sanitized) {
      session.sendError("action-bar-invalid");
      return;
    }
    session.actionBarUpdatePending = true;
    void this.persist(session, playerId, sanitized);
  }

  applyResolvedOutcomes(): void {
    for (const outcome of this.outcomes.splice(0)) outcome();
  }

  private sanitizeActionBar(
    requested: ActionBar,
    vocation: CharacterVocation,
  ): ActionBar | null {
    const next = createDefaultActionBar();
    const hotkeys = new Set<string>();
    for (const [index, slot] of requested.entries()) {
      if (slot.hotkey && hotkeys.has(slot.hotkey)) return null;
      if (slot.hotkey) hotkeys.add(slot.hotkey);
      const action = slot.action
        ? sanitizeActionBarAction(
            slot.action,
            vocation,
            this.spells,
            this.items,
          )
        : null;
      if (slot.action && !action) return null;
      next[index] = { action, hotkey: slot.hotkey };
    }
    return next;
  }

  private async persist(
    session: Session,
    characterId: string,
    actionBar: ActionBar,
  ): Promise<void> {
    try {
      await this.characters.updateActionBar(characterId, actionBar);
      this.outcomes.push(() => {
        session.actionBarUpdatePending = false;
        if (
          !this.registry.contains(session) ||
          session.playerId !== characterId
        ) {
          return;
        }
        session.actionBar = actionBar.map((slot) => ({
          ...slot,
          action: slot.action ? { ...slot.action } : null,
        }));
        session.send({ type: "action-bar-updated", actionBar });
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(
        `action bar update failed for character ${characterId}: ${reason}`,
      );
      this.outcomes.push(() => {
        session.actionBarUpdatePending = false;
        if (
          !this.registry.contains(session) ||
          session.playerId !== characterId
        ) {
          return;
        }
        session.send({
          type: "action-bar-updated",
          actionBar: session.actionBar,
        });
        session.sendError("action-bar-update-failed");
      });
    }
  }
}
